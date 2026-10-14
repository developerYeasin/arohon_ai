# Free local OCR (Tesseract ben+eng) for pages without a usable text layer — the bulk alternative to reading by eye.
# Pages are rendered in memory only (nothing written to disk). OCR'd pages are tagged text_stats.ocr so they can be
# reviewed / re-read by eye later; load.py then parses them like any other page.
#   python ocr.py dry FILE_ID [FROM] [N]   print OCR text of N pages (default 3), store nothing
#   python ocr.py file FILE_ID             OCR every needs_visual page of the file, store, load into the bank
#   python ocr.py all [SHARD/N]            same for every file of the visual queue; SHARD/N runs only files with id%N==SHARD
import io
import json
import re
import re
import os
import sys
import time

import pymupdf
import pytesseract
from PIL import Image

from extract import connect, SOURCE, clean

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
pymupdf.TOOLS.mupdf_display_errors(False)
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
TESSDATA = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'tessdata_arohon')
os.environ['TESSDATA_PREFIX'] = TESSDATA
os.environ.setdefault('OMP_THREAD_LIMIT', '1')  # one core per worker; parallelism comes from shards
CONFIG = '--psm 6'


def gutter(img):
    """x of a blank vertical strip near the middle (two-column layout), else None. psm 6 reads a page as one block,
    which interleaves the two columns line by line, so two-column pages are cut and read half by half."""
    w, h = img.size
    small = img.resize((w // 4, h // 4))
    sw, sh = small.size
    px = small.load()
    top, bot = sh // 10, sh - sh // 10  # skip header / footer lines that span both columns
    best = None
    for x in range(int(sw * 0.38), int(sw * 0.62)):
        dark = sum(1 for y in range(top, bot) if px[x, y] < 140)
        # a blank strip, or a printed vertical rule between the columns
        if (dark <= (bot - top) * 0.01 or dark >= (bot - top) * 0.6) and (best is None or abs(x - sw // 2) < abs(best - sw // 2)):
            best = x
    return best * 4 if best is not None else None


FAST = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'tessdata_fast')


def read_with(img, cfg):
    g = gutter(img)
    if g is None:
        return pytesseract.image_to_string(img, lang='ben+eng', config=cfg)
    w, h = img.size
    return '\n'.join(pytesseract.image_to_string(img.crop(box), lang='ben+eng', config=cfg)
                     for box in ((0, 0, g, h), (g, 0, w, h)))


def looks_complete(text):
    """The fast model is ~7x quicker but sometimes drops answer marks: keep its text only when every
    option block still has its answer mark."""
    blocks = len(re.findall(r'ঘ\s*[.)]', text))
    marks = len(re.findall(r'(?:উত্তর|উ)\s*[:ঃ.]?\s*[কখগঘ]', text))
    return len(text.strip()) >= 100 and marks >= blocks


def read(img):
    if os.path.isdir(FAST):
        text = read_with(img, f'--tessdata-dir {FAST} {CONFIG}')
        if looks_complete(text):
            read.fast += 1
            return text
    read.best += 1
    return read_with(img, CONFIG)


read.fast = read.best = 0


def ocr_page(page, dpi=300):
    # some scans have huge page sizes: cap the long side at 5000 px (≈300 dpi on A4) so PIL accepts the image
    dpi = min(dpi, int(5000 * 72 / max(page.rect.width, page.rect.height)))
    pix = page.get_pixmap(dpi=dpi, colorspace=pymupdf.csGRAY)
    img = Image.open(io.BytesIO(pix.tobytes('png')))
    ocr_page.cols = 2 if gutter(img) is not None else 1
    text = read(img)
    if len(text.strip()) < 200:  # little readable text: maybe an upside-down / rotated scan
        try:
            rot = pytesseract.image_to_osd(img, output_type=pytesseract.Output.DICT)['rotate']
            if rot:
                text = read(img.rotate(-rot, expand=True))
        except Exception:
            pass
    return text


def alive(db):
    """The connection idles out during long OCR runs: reconnect if it has dropped."""
    try:
        db.ping(False)
    except Exception:
        db.connect()


def pages_of(db, fid, start=1, n=None):
    cur = db.cursor()
    cur.execute('SELECT path, kind FROM ingest_files WHERE id=%s', (fid,))
    rel, kind = cur.fetchone()
    cur.execute(f"""SELECT id, page_no FROM ingest_pages WHERE file_id=%s AND text_status='needs_visual' AND page_no>=%s
                    AND (error IS NULL OR error<>'ocr_empty')
                    ORDER BY page_no{' LIMIT %s' % int(n) if n else ''}""", (fid, start))
    return rel, kind, cur.fetchall()


_bank = [None, 0]


def bank(db):
    """Bank holds every question/item key (~600k) from the remote DB; loading it is slow, so a worker reuses one
    and refreshes it every 30 minutes to see what the other workers added."""
    from load import Bank
    if _bank[0] is None or time.time() - _bank[1] > 1800:
        _bank[0] = None  # free the old key sets before loading new ones
        _bank[0], _bank[1] = Bank(db), time.time()
    _bank[0].db = db
    return _bank[0]


def do_file(db, fid):
    from load import Bank, load_file
    rel, kind, pages = pages_of(db, fid)
    from load import has_doc_twin
    if kind == 'pdf' and has_doc_twin(rel, db.cursor()):
        # its .doc/.docx twin was already loaded: OCR would only be thrown away by load_file
        cur = db.cursor()
        cur.execute("""UPDATE ingest_pages SET text_status='done', parsed_at=NOW(),
                       error='same content loaded from the .doc/.docx next to it'
                       WHERE file_id=%s AND text_status='needs_visual'""", (fid,))
        print(f'{fid}: skipped, .doc twin already loaded  {rel[-80:]}', flush=True)
        return
    doc = pymupdf.open(os.path.join(SOURCE, rel))
    cur = db.cursor()
    done = 0
    for pid, no in pages:
        try:
            text = ocr_page(doc[no - 1])
        except Exception as e:
            alive(db); cur = db.cursor()
            cur.execute("UPDATE ingest_pages SET error=%s WHERE id=%s", (f'ocr: {e}'[:500], pid))
            continue
        alive(db)  # the connection idles out during long OCR runs
        cur = db.cursor()
        if len(text.strip()) < 100:  # OCR found (almost) nothing, e.g. low-contrast phone photos: leave it for reading by eye
            cur.execute("UPDATE ingest_pages SET error='ocr_empty' WHERE id=%s", (pid,))
            print(time.strftime('%H:%M'), f'{fid} page {no}: OCR empty, left for reading by eye', flush=True)
            continue
        cur.execute("""UPDATE ingest_pages SET text=%s, text_status='done', parsed_at=NULL, text_stats=%s, error=NULL
                       WHERE id=%s AND text_status='needs_visual'""",
                    (clean(text), json.dumps({'ocr': len(text), 'cols': ocr_page.cols}), pid))
        db.commit()
        done += 1
        print(time.strftime('%H:%M'), f'{fid} page {no} ({done}/{len(pages)}) ok', flush=True)
        if done % 40 == 0:  # load as we go so the bank grows during long files; reloads skip existing keys
            load_file(bank(db), fid, rel, kind)
    alive(db)
    res = load_file(bank(db), fid, rel, kind)
    db.commit()
    print(f'{fid}: {len(pages)}p OCR → loaded (questions, study items) {res}  {rel[-80:]}', flush=True)


if __name__ == '__main__':
    cmd, db = sys.argv[1], connect()
    if cmd == 'dry':
        fid = int(sys.argv[2])
        rel, _, pages = pages_of(db, fid, int(sys.argv[3]) if len(sys.argv) > 3 else 1, int(sys.argv[4]) if len(sys.argv) > 4 else 3)
        doc = pymupdf.open(os.path.join(SOURCE, rel))
        for pid, no in pages:
            print(f'=== page {pid} (#{no})\n{ocr_page(doc[no - 1])}')
    elif cmd == 'file':
        do_file(db, int(sys.argv[2]))
    elif cmd == 'all':
        from visual import priority
        cur = db.cursor()
        cur.execute("""SELECT f.id, f.path FROM ingest_files f JOIN ingest_pages p ON p.file_id=f.id
                       WHERE p.text_status='needs_visual' AND (p.error IS NULL OR p.error<>'ocr_empty')
                       GROUP BY f.id, f.path""")
        rows = sorted(cur.fetchall(), key=lambda r: (priority(r[1]), r[0]))
        # every worker walks the whole queue (its shard's files first) and claims a file with a MySQL named lock,
        # so a worker whose own share is done keeps helping instead of idling
        shard, n = map(int, sys.argv[2].split('/')) if len(sys.argv) > 2 else (0, 1)
        rows = [r for r in rows if r[0] % n == shard] + [r for r in rows if r[0] % n != shard]
        for fid, _ in rows:
            alive(db)
            cur = db.cursor()
            cur.execute('SELECT GET_LOCK(%s, 0)', (f'arohon_ocr_{fid}',))
            if cur.fetchone()[0] != 1:
                continue  # another worker has it
            cur.execute("""SELECT COUNT(*) FROM ingest_pages WHERE file_id=%s AND text_status='needs_visual'
                           AND (error IS NULL OR error<>'ocr_empty')""", (fid,))
            if not cur.fetchone()[0]:
                cur.execute('SELECT RELEASE_LOCK(%s)', (f'arohon_ocr_{fid}',))
                continue  # finished by another worker meanwhile
            for attempt in range(3):
                try:
                    alive(db)
                    do_file(db, fid)
                    break
                except Exception as e:
                    print(f'{fid}: FAILED (try {attempt + 1}) {e}', flush=True)
                    time.sleep(30)
            try:
                db.cursor().execute('SELECT RELEASE_LOCK(%s)', (f'arohon_ocr_{fid}',))
            except Exception:
                pass
