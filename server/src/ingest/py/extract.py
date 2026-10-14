# Reads every source file and stores each page's Unicode text in ingest_pages (resumable; nothing is written
# to disk except one temporary .docx at a time while Word converts a legacy .doc).
#   python extract.py docs     register + read every .doc/.docx/.rtf (whole file = page 1)
#   python extract.py pdfs     read every page of every registered PDF (registers ones the Node scan could not open)
#   python extract.py status
import hashlib
import json
import os
import re
import sys
import tempfile
import time

import pymupdf
import pymysql

from pagetext import page_text, garble_score

GARBLED = 0.012  # garble_score above this: the page's Unicode text layer is unusable
from docxtext import docx_text

HERE = os.path.dirname(os.path.abspath(__file__))
SERVER = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
SOURCE = os.environ.get('PDF_DIR') or os.path.abspath(os.path.join(SERVER, '..', 'source_pdf'))
DOC_EXT = ('.doc', '.docx', '.rtf')
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
pymupdf.TOOLS.mupdf_display_errors(False)


def env():
    vals = {}
    for line in open(os.path.join(SERVER, '.env'), encoding='utf-8'):
        m = re.match(r'\s*([A-Z_]+)\s*=\s*(.*?)\s*$', line)
        if m:
            vals[m.group(1)] = m.group(2).strip('"\'')
    return vals


def connect():
    e = env()
    return pymysql.connect(host=e['DB_HOST'], port=int(e.get('DB_PORT', 3306)), user=e['DB_USER'],
                           password=e['DB_PASSWORD'], database=e['DB_NAME'], charset='utf8mb4', autocommit=True)


def sha1(path):
    h = hashlib.sha1()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def walk(exts):
    for d, _, fs in os.walk(SOURCE):
        for f in sorted(fs):
            if f.lower().endswith(exts) and not f.startswith('~$'):
                yield os.path.join(d, f)


def category(rel):
    return os.path.dirname(rel)[:255]


def clean(t):
    # MySQL utf8mb4 accepts everything except lone surrogates / NULs that broken PDFs sometimes produce
    return t.replace('\x00', '').encode('utf-8', 'replace').decode('utf-8')


# ---------- DOC / DOCX ----------

def _word_pids():
    import subprocess
    out = subprocess.run(['tasklist', '/FI', 'IMAGENAME eq WINWORD.EXE', '/FO', 'CSV', '/NH'],
                         capture_output=True, text=True).stdout
    return {int(r.split('","')[1]) for r in out.splitlines() if r.startswith('"WINWORD')}


class Word:
    """One hidden Word instance, restarted every 150 files. A file that makes Word wait on a dialog nobody can
    see (repair, password, conversion prompts) gets Word killed after TIMEOUT seconds; the file is then failed."""
    TIMEOUT = 90

    def __init__(self):
        self.app = None
        self.pid = None
        self.opened = 0

    def start(self):
        import win32com.client
        before = _word_pids()
        self.app = win32com.client.DispatchEx('Word.Application')
        new = _word_pids() - before
        self.pid = new.pop() if len(new) == 1 else None
        self.app.Visible = False
        self.app.DisplayAlerts = 0
        self.app.AutomationSecurity = 3  # never run macros
        self.opened = 0

    def kill(self):
        if self.pid:
            import subprocess
            subprocess.run(['taskkill', '/F', '/PID', str(self.pid)], capture_output=True)

    def to_docx(self, src, dst):
        import threading
        if self.app is None or self.opened >= 150:
            self.quit(); self.start()
        self.opened += 1
        timer = threading.Timer(self.TIMEOUT, self.kill)
        timer.start()
        try:
            d = self.app.Documents.Open(src, ConfirmConversions=False, ReadOnly=True, AddToRecentFiles=False,
                                        PasswordDocument='~nopass~', Visible=False, NoEncodingDialog=True)
            try:
                d.SaveAs2(dst, FileFormat=16)
            finally:
                d.Close(False)
        finally:
            timer.cancel()

    def quit(self):
        if self.app is not None:
            try:
                self.app.Quit(False)
            except Exception:
                self.kill()
        self.app = None
        self.pid = None


def read_doc(path, word):
    if path.lower().endswith('.docx'):
        try:
            return docx_text(path)
        except Exception:
            pass  # some .docx are really .doc/.rtf renamed; let Word read them
    fd, tmp = tempfile.mkstemp(suffix='.docx')
    os.close(fd)
    try:
        word.to_docx(path, tmp)
        return docx_text(tmp)
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass


def docs(db):
    cur = db.cursor()
    word = Word()
    done = added = dup = failed = 0
    t0 = time.time()
    try:
        for path in walk(DOC_EXT):
            rel = os.path.relpath(path, SOURCE)
            h = sha1(path)
            cur.execute('SELECT id FROM ingest_files WHERE sha1=%s', (h,))
            row = cur.fetchone()
            if row:
                cur.execute("SELECT text_status FROM ingest_pages WHERE file_id=%s AND page_no=1", (row[0],))
                st = cur.fetchone()
                if st and st[0] != 'pending':
                    dup += 1
                    continue
                file_id = row[0]
            else:
                ext = os.path.splitext(path)[1].lower().lstrip('.')
                cur.execute('INSERT INTO ingest_files (sha1, path, pages, kind, category) VALUES (%s,%s,1,%s,%s)',
                            (h, rel, ext, category(rel)))
                file_id = cur.lastrowid
                cur.execute("INSERT INTO ingest_pages (file_id, page_no, status) VALUES (%s,1,'done')", (file_id,))
            try:
                text, stats = read_doc(path, word)
                status = 'done' if text.strip() else 'needs_visual'
                cur.execute('UPDATE ingest_pages SET text=%s, text_stats=%s, text_status=%s, error=NULL WHERE file_id=%s AND page_no=1',
                            (clean(text), json.dumps(stats), status, file_id))
                added += 1
            except Exception as e:
                failed += 1
                word.quit()
                cur.execute("UPDATE ingest_pages SET text_status='failed', error=%s WHERE file_id=%s AND page_no=1",
                            (str(e)[:500], file_id))
                print(f'! {rel}: {str(e)[:120]}', flush=True)
            done += 1
            if done % 25 == 0:
                print(f'… {done} docs read ({added} ok, {failed} failed, {dup} already done) {time.time() - t0:.0f}s', flush=True)
    finally:
        word.quit()
    print(f'✔ docs: {added} read, {failed} failed, {dup} skipped (duplicate or already read)')


# ---------- PDF ----------

def needs_visual(page, text, stats):
    """True when the page shows content the text layer does not carry: a scan, or text set in a font that has
    no Unicode map (Word's Identity-H subsets), which MuPDF silently drops."""
    chars = stats['bijoy'] + stats['text']
    if chars < 40 or garble_score(text) > GARBLED:
        return True
    doc = page.parent
    for f in page.get_fonts(full=True):
        name = re.sub(r'^[A-Z]{6}\+', '', f[3]).lower()
        if f[2] == 'Type0' and 'Identity' in (f[5] or '') and not name.startswith(('wingding', 'symbol', 'webding')):
            try:
                tu = doc.xref_get_key(f[0], 'ToUnicode')
                if tu[0] == 'null':
                    return True
                # Word writes a partial map (space, digits, punctuation) for Bijoy subsets; the letters are lost
                if 'mj' in name and tu[0] == 'xref' and _tounicode_size(doc, int(tu[1].split()[0])) < 40:
                    return True
            except Exception:
                pass
    return False


def _tounicode_size(doc, xref):
    cmap = doc.xref_stream(xref).decode('latin-1')
    n = 0
    for a, b in re.findall(r'<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*[<\[]', cmap):
        n += int(b, 16) - int(a, 16) + 1  # bfrange
    n += len(re.findall(r'^\s*<[0-9A-Fa-f]+>\s*<[0-9A-Fa-f]+>\s*$', cmap, re.M))  # bfchar
    return n


def register_pdf(cur, path):
    rel = os.path.relpath(path, SOURCE)
    h = sha1(path)
    cur.execute('SELECT id FROM ingest_files WHERE sha1=%s', (h,))
    if cur.fetchone():
        return
    try:
        n = pymupdf.open(path).page_count
    except Exception as e:
        print(f'! unreadable {rel}: {e}', flush=True)
        n = 0
    cur.execute("INSERT INTO ingest_files (sha1, path, pages, kind, category) VALUES (%s,%s,%s,'pdf',%s)",
                (h, rel, n, category(rel)))
    fid = cur.lastrowid
    if n:
        cur.executemany('INSERT INTO ingest_pages (file_id, page_no) VALUES (%s,%s)', [(fid, i + 1) for i in range(n)])
    print(f'+ {rel} ({n} pages)', flush=True)


def pdfs(db, register=True, worker=0, workers=1):
    cur = db.cursor()
    if register:
        cur.execute("SELECT path FROM ingest_files WHERE kind='pdf'")
        known = {r[0] for r in cur.fetchall()}
        for path in walk(('.pdf',)):
            if os.path.relpath(path, SOURCE) not in known:
                register_pdf(cur, path)
    cur.execute("""SELECT f.id, f.path, COUNT(*) FROM ingest_files f JOIN ingest_pages p ON p.file_id=f.id
                   WHERE f.kind='pdf' AND p.text_status='pending' AND MOD(f.id, %s)=%s
                   GROUP BY f.id, f.path ORDER BY f.id""", (workers, worker))
    files = cur.fetchall()
    print(f'{len(files)} PDFs with pages to read (worker {worker}/{workers})', flush=True)
    t0 = time.time()
    total = 0
    for i, (fid, rel, _) in enumerate(files, 1):
        path = os.path.join(SOURCE, rel)
        cur.execute("UPDATE ingest_files SET category=%s WHERE id=%s AND category IS NULL", (category(rel), fid))
        cur.execute("SELECT id, page_no FROM ingest_pages WHERE file_id=%s AND text_status='pending' ORDER BY page_no", (fid,))
        pages = cur.fetchall()
        try:
            doc = pymupdf.open(path)
        except Exception as e:
            cur.execute("UPDATE ingest_pages SET text_status='failed', error=%s WHERE file_id=%s", (str(e)[:500], fid))
            print(f'! {rel}: {e}', flush=True)
            continue
        rows = []
        for pid, no in pages:
            try:
                page = doc[no - 1]
                text, stats = page_text(page)
                status = 'needs_visual' if needs_visual(page, text, stats) else 'done'
                rows.append((pid, fid, no, clean(text), json.dumps(stats), status, None))
            except Exception as e:
                rows.append((pid, fid, no, None, None, 'failed', str(e)[:500]))
        # one multi-row statement per ~200 pages instead of a round trip per page to the remote DB
        for k in range(0, len(rows), 200):
            cur.executemany('''INSERT INTO ingest_pages (id, file_id, page_no, text, text_stats, text_status, error)
                               VALUES (%s,%s,%s,%s,%s,%s,%s) AS new
                               ON DUPLICATE KEY UPDATE text=new.text, text_stats=new.text_stats,
                               text_status=new.text_status, error=new.error''', rows[k:k + 200])
        total += len(rows)
        if i % 20 == 0:
            print(f'… {i}/{len(files)} files, {total} pages, {time.time() - t0:.0f}s', flush=True)
    print(f'✔ pdfs: {total} pages read')


def recheck(db):
    """Send already-read PDF pages whose Unicode text is garbled to the read-by-eye queue, and drop what was
    loaded from them."""
    cur = db.cursor()
    cur.execute("SELECT MAX(id) FROM ingest_pages")
    top, flipped, last = cur.fetchone()[0] or 0, 0, 0
    while last < top:
        cur.execute("""SELECT p.id, p.text FROM ingest_pages p JOIN ingest_files f ON f.id=p.file_id
                       WHERE p.id>%s AND p.id<=%s AND f.kind='pdf' AND p.text_status='done'
                       AND NOT JSON_CONTAINS_PATH(p.text_stats, 'one', '$.visual')""", (last, last + 5000))
        bad = [pid for pid, text in cur.fetchall() if garble_score(text or '') > GARBLED]
        if bad:
            cur.execute('DELETE FROM question_versions WHERE question_id IN (SELECT id FROM questions WHERE page_id IN %s)', (bad,))
            cur.execute('DELETE FROM questions WHERE page_id IN %s', (bad,))
            cur.execute('DELETE FROM study_items WHERE page_id IN %s', (bad,))
            cur.execute("UPDATE ingest_pages SET text_status='needs_visual', parsed_at=NULL, error='garbled text layer' WHERE id IN %s", (bad,))
            flipped += len(bad)
        last += 5000
    print(f'✔ recheck: {flipped} garbled pages moved to the read-by-eye queue')


def status(db):
    cur = db.cursor()
    cur.execute('SELECT kind, COUNT(*), SUM(pages) FROM ingest_files GROUP BY kind')
    for r in cur.fetchall():
        print('files', r)
    cur.execute('SELECT f.kind, p.text_status, COUNT(*) FROM ingest_pages p JOIN ingest_files f ON f.id=p.file_id GROUP BY f.kind, p.text_status')
    for r in cur.fetchall():
        print('pages', r)


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'status'
    db = connect()
    if cmd == 'pdfs':
        # python extract.py pdfs [K/N] [--no-register]   (run N copies with K = 0..N-1 to read in parallel)
        k, n = (map(int, sys.argv[2].split('/')) if len(sys.argv) > 2 and '/' in sys.argv[2] else (0, 1))
        pdfs(db, register='--no-register' not in sys.argv and k == 0, worker=k, workers=n)
    else:
        {'docs': docs, 'status': status, 'recheck': recheck}[cmd](db)
