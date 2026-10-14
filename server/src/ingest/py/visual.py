# Pages without a usable text layer (scans, fonts with no Unicode map) are read by eye: this renders them to
# small temporary images, and stores the transcription as the page text so load.py parses it like any other page.
#   python visual.py queue                    files with pages to read, most useful first
#   python visual.py render FILE_ID [FROM] [N] render N pages (default 6) to the temp folder, print their paths
#   python visual.py save TRANSCRIPT.txt       store transcriptions; the file holds blocks "=== page <page id>" + text
#   python visual.py clean                     delete rendered images
import glob
import json
import os
import re
import sys
import tempfile

import pymupdf

from extract import connect, SOURCE, clean

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
pymupdf.TOOLS.mupdf_display_errors(False)
OUT = os.path.join(tempfile.gettempdir(), 'arohon_visual')

# job-exam question banks first: they are what the quiz bank needs most
PRIORITY = [r'প্রশ্ন\s*ব্যাংক|question\s*bank', r'job\s*solution|জব\s*সলিউশন|নিয়োগ', r'বিসিএস|bcs', r'bank|ব্যাংক',
            r'primary|প্রাথমিক|প্রাইমারি', r'ntrca|শিক্ষক', r'mcq', r'current|কারেন্ট']


def priority(path):
    p = path.lower()
    for i, rx in enumerate(PRIORITY):
        if re.search(rx, p):
            return i
    return len(PRIORITY)


def queue(db):
    cur = db.cursor()
    cur.execute("""SELECT f.id, f.path, COUNT(*) FROM ingest_files f JOIN ingest_pages p ON p.file_id=f.id
                   WHERE p.text_status='needs_visual' GROUP BY f.id, f.path""")
    rows = sorted(cur.fetchall(), key=lambda r: (priority(r[1]), r[0]))
    total = sum(r[2] for r in rows)
    print(f'{len(rows)} files, {total} pages to read by eye')
    for fid, path, n in rows[:int(sys.argv[2]) if len(sys.argv) > 2 else 40]:
        print(f'{fid:6} {n:5}p  {path[-110:]}')


def render(db, fid, start=1, n=6, dpi=110):
    cur = db.cursor()
    cur.execute('SELECT path FROM ingest_files WHERE id=%s', (fid,))
    path = cur.fetchone()[0]
    cur.execute("""SELECT id, page_no FROM ingest_pages WHERE file_id=%s AND text_status='needs_visual' AND page_no>=%s
                   ORDER BY page_no LIMIT %s""", (fid, start, n))
    pages = cur.fetchall()
    os.makedirs(OUT, exist_ok=True)
    doc = pymupdf.open(os.path.join(SOURCE, path))
    for pid, no in pages:
        pix = doc[no - 1].get_pixmap(dpi=dpi, colorspace=pymupdf.csGRAY)
        out = os.path.join(OUT, f'p{pid}_{no}.jpg')
        pix.save(out, jpg_quality=70)
        print(f'page {pid} (#{no}) {pix.width}x{pix.height} {out}')


def save(db, transcript):
    text = open(transcript, encoding='utf-8').read()
    parts = re.split(r'^=== page (\d+)[^\n]*\n', text, flags=re.M)
    cur = db.cursor()
    n = 0
    for pid, body in zip(parts[1::2], parts[2::2]):
        body = body.strip()
        cur.execute("""UPDATE ingest_pages SET text=%s, text_status='done', parsed_at=NULL,
                       text_stats=%s, error=NULL WHERE id=%s AND (text_status='needs_visual'
                       OR JSON_CONTAINS_PATH(text_stats, 'one', '$.visual'))""",
                    (clean(body), json.dumps({'visual': len(body)}), int(pid)))
        n += cur.rowcount
    print(f'✔ saved {n} page transcriptions')


if __name__ == '__main__':
    cmd = sys.argv[1]
    db = connect()
    if cmd == 'queue':
        queue(db)
    elif cmd == 'render':
        render(db, int(sys.argv[2]), int(sys.argv[3]) if len(sys.argv) > 3 else 1, int(sys.argv[4]) if len(sys.argv) > 4 else 6)
    elif cmd == 'save':
        save(db, sys.argv[2])
    elif cmd == 'commit':
        # python visual.py commit FILE_ID TRANSCRIPT [N]: store, load that file into the bank, render the next N pages
        from load import Bank, load_file
        fid = int(sys.argv[2])
        save(db, sys.argv[3])
        cur = db.cursor()
        cur.execute('SELECT path, kind FROM ingest_files WHERE id=%s', (fid,))
        rel, kind = cur.fetchone()
        print('loaded (questions, study items):', load_file(Bank(db), fid, rel, kind))
        for f in glob.glob(os.path.join(OUT, '*.jpg')):
            os.remove(f)
        render(db, fid, 1, int(sys.argv[4]) if len(sys.argv) > 4 else 6)
    elif cmd == 'clean':
        for f in glob.glob(os.path.join(OUT, '*.jpg')):
            os.remove(f)
        print('cleaned')
