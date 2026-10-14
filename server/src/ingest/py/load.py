# Parsed items → question bank. Runs file by file over pages whose text is read (resumable via parsed_at):
#   MCQs with an answer (inline, [উ: ক] bullet, or the chapter's উত্তরমালা)  → questions
#   everything else (MCQs without an answer, creative, fill-in, true/false, matching, Q&A, notes) → study_items
#   python load.py [--limit N] [--file-id ID]
import hashlib
import json
import os
import re
import sys

from extract import connect, SOURCE, sha1
from parse import parse
from classify import classify, SUBJECTS

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
BN_OPT = 'কখগঘ'


def norm(s):
    return re.sub(r'\s+', ' ', s or '').strip()


def qkey(subject_id, body, opts):
    return hashlib.sha1(f'{subject_id}|{norm(body)}|{"|".join(norm(o) for o in opts)}'.encode()).hexdigest()


def ikey(subject_id, kind, body):
    return hashlib.sha1(f'{subject_id}|{kind}|{norm(body)}'.encode()).hexdigest()


class Bank:
    def __init__(self, db):
        self.db = db
        cur = db.cursor()
        cur.execute('SELECT slug, id FROM subjects')
        self.subjects = dict(cur.fetchall())
        cur.execute('SELECT subject_id, name_bn, id FROM topics')
        self.topics = {(s, n): i for s, n, i in cur.fetchall()}
        # rows written before dedup_key existed (or by an older loader) get their key filled in once
        cur.execute('SELECT id, subject_id, body, option_a, option_b, option_c, option_d FROM questions WHERE dedup_key IS NULL')
        fill = [(qkey(r[1], r[2], r[3:]), r[0]) for r in cur.fetchall()]
        cur.execute('SELECT id, subject_id, kind, body FROM study_items WHERE dedup_key IS NULL')
        fill_items = [(ikey(s, k, b), i) for i, s, k, b in cur.fetchall()]
        for table, rows in (('questions', fill), ('study_items', fill_items)):
            if not rows:
                continue
            # one multi-row insert into a temp table and one joined update, instead of an UPDATE per row
            cur.execute('CREATE TEMPORARY TABLE IF NOT EXISTS _keys (id INT PRIMARY KEY, k CHAR(40))')
            cur.execute('DELETE FROM _keys')
            cur.executemany('INSERT INTO _keys (k, id) VALUES (%s,%s)', rows)
            cur.execute(f'UPDATE {table} t JOIN _keys x ON x.id=t.id SET t.dedup_key=x.k')
        cur.execute('SELECT dedup_key FROM questions')
        self.seen = {r[0] for r in cur.fetchall()}
        cur.execute('SELECT dedup_key FROM study_items')
        self.seen_items = {r[0] for r in cur.fetchall()}

    def subject(self, slug):
        if slug not in self.subjects:
            track, bn, en = SUBJECTS[slug]
            cur = self.db.cursor()
            cur.execute('INSERT INTO subjects (track, slug, name_bn, name_en) VALUES (%s,%s,%s,%s)', (track, slug, bn, en))
            self.subjects[slug] = cur.lastrowid
        return self.subjects[slug]

    def topic(self, subject_id, name):
        key = (subject_id, name)
        if key not in self.topics:
            cur = self.db.cursor()
            cur.execute('INSERT INTO topics (subject_id, name_bn) VALUES (%s,%s)', (subject_id, name))
            self.topics[key] = cur.lastrowid
        return self.topics[key]


LEVELS = {'জ্ঞান': 1, 'অনুধাবন': 2, 'প্রয়োগ': 3, 'উচ্চতর দক্ষতা': 4, 'উচ্চতর দÿতা': 4}
LEVEL_RX = re.compile(r'\s*\((জ্ঞান|অনুধাবন|প্রয়োগ|উচ্চতর\s*দ(?:ক্ষ|ÿ)তা)\)\s*')
REF_RX = re.compile(r'\s*\[([^\[\]]{3,120})\]?\s*$')
EXAM_RX = re.compile(r'(বিসিএস|ব্যাংক|বোর্ড|স্কুল|কলেজ|ইনস্টিটিউশন|একাডেমি|মাদ্রাসা|বিদ্যালয়|মন্ত্রণালয়|অধিদপ্তর|পরীক্ষা|নিয়োগ|'
                     r'প্রাথমিক|BCS|Bank|Board|School|College|[০-৯0-9]{2}তম|[০-৯]{2}\'|ঢা\.?\s*বো|রা\.?\s*বো|কু\.?\s*বো|চ\.?\s*বো|'
                     r'য\.?\s*বো|সি\.?\s*বো|দি\.?\s*বো|ব\.?\s*বো|ম\.?\s*বো|DU|RU|JU|CU)', re.I)


def split_meta(body):
    """'প্রশ্ন? (জ্ঞান) [ঢাকা বোর্ড ২০২৩]' → ('প্রশ্ন?', difficulty 1, 'ঢাকা বোর্ড ২০২৩')."""
    difficulty, ref = 2, None
    m = LEVEL_RX.search(body)
    if m:
        difficulty = LEVELS.get(re.sub(r'\s+', ' ', m.group(1)), 2)
        body = (body[:m.start()] + ' ' + body[m.end():]).strip()
    m = REF_RX.search(body)
    if m and EXAM_RX.search(m.group(1)):
        ref = m.group(1).strip(' ,;')[:120]
        body = body[:m.start()].strip()
    return body, difficulty, ref


DIRECTIVE = re.compile(r'^\s*#(exam|subject):\s*(.*)$')
TAG = re.compile(r'\s*\{([a-z][a-z-]+)\}\s*')
BN_DIGITS = str.maketrans('০১২৩৪৫৬৭৮৯', '0123456789')


def latest(marks, line):
    val = None
    for at, v in marks:
        if at > line:
            break
        val = v
    return val or None


def take_tag(s):
    m = TAG.search(s)
    if m and m.group(1) in SUBJECTS:
        return (s[:m.start()] + ' ' + s[m.end():]).strip(), m.group(1)
    return s, None


def year_of(ref):
    m = re.search(r'(19[5-9][0-9]|20[0-4][0-9])', (ref or '').translate(BN_DIGITS))
    return int(m.group(1)) if m else None


def has_doc_twin(rel, cur=None):
    """A PDF exported from a .doc/.docx that is also in the source: next to it, or in a sibling folder
    ('…/PDF/3.pdf' ↔ '…/DOC/3.doc', '…/PDF File/3.pdf' ↔ '…/Word File/3.doc'). With a cursor, the twin
    only counts once its text was actually read (a .doc Word could not open leaves the PDF as the source)."""
    path = os.path.join(SOURCE, rel)
    stem = os.path.splitext(os.path.basename(path))[0].lower()
    here = os.path.dirname(path)
    dirs = [here]
    parent = os.path.dirname(here)
    try:
        dirs += [os.path.join(parent, d) for d in os.listdir(parent)
                 if d != os.path.basename(here) and re.search(r'doc|word', d, re.I)]
    except OSError:
        pass
    for d in dirs:
        try:
            for f in os.listdir(d):
                s, ext = os.path.splitext(f)
                if ext.lower() in ('.doc', '.docx') and s.lower() == stem:
                    if cur is None or twin_read(cur, os.path.join(d, f)):
                        return True
        except OSError:
            pass
    return False


def twin_read(cur, path):
    cur.execute('''SELECT 1 FROM ingest_files f JOIN ingest_pages p ON p.file_id=f.id
                   WHERE f.sha1=%s AND p.text_status='done' LIMIT 1''', (sha1(path),))
    return cur.fetchone() is not None


def source_label(rel, page_no, kind):
    name = os.path.splitext(os.path.basename(rel))[0]
    return (f'{name}, পৃ. {page_no}' if kind == 'pdf' else name)[:160]


OCR_SYMBOL = re.compile(r'[*¢©®|<>~@#$&_\{}]')
OCR_MIXED_DIGITS = re.compile(r'[0-9][০-৯]|[০-৯][0-9]|[০-৯][A-Za-z]|[A-Za-z][০-৯]')  # e.g. '8৪৮', 'ঙ৬' handled by symbol list
OCR_GARBLE = re.compile(r'[)\]\[(]{2,}|[A-Za-z€][0-9]{3,}|[0-9]{4,}[A-Za-z%]')  # e.g. '€077)])979101%6'
OCR_CUT_START = re.compile(r'^[০-৯0-9]+\s*[।|]')  # stem starts mid-sentence after a number: its first line was lost
OCR_JUNK = re.compile(r'(?<![A-Za-z])[A-Za-z]{1,4}(?![A-Za-z])')


def ocr_suspect(body, options):
    """An OCR'd Bangla question with short stray Latin tokens (misread conjuncts like 'HR', 'fag') goes to review."""
    text = ' '.join([body] + list(options))
    bangla = len(re.findall('[ঀ-৿]', text))
    latin = len(re.findall('[A-Za-z]', text))
    return (bangla > latin and bool(OCR_JUNK.search(text)) or '�' in text or bool(OCR_SYMBOL.search(text))
            or bool(OCR_MIXED_DIGITS.search(text)) or any(not o.strip() for o in options)
            or bool(OCR_GARBLE.search(text)) or bool(OCR_CUT_START.match(body.strip())))


def load_file(bank, fid, rel, kind, produced=None):
    """produced: optional dict that collects every key this parse yields ({'q': {key: answer}, 's': set()}),
    including items skipped as already present — reparse.py uses it to find rows an older parse got wrong."""
    cur = bank.db.cursor()
    cur.execute("SELECT id, page_no, text, text_status, JSON_CONTAINS_PATH(text_stats, 'one', '$.ocr') FROM ingest_pages WHERE file_id=%s ORDER BY page_no", (fid,))
    rows = cur.fetchall()
    ocr_pages = {r[0] for r in rows if r[4]}
    pages = [r[:4] for r in rows]
    if any(st == 'pending' for _, _, _, st in pages):
        return None  # not fully read yet
    if kind == 'pdf' and has_doc_twin(rel, cur):
        cur.execute("UPDATE ingest_pages SET parsed_at=NOW(), error='same content loaded from the .doc/.docx next to it' WHERE file_id=%s", (fid,))
        return 'twin'

    # join the pages, remembering which page each line came from. Transcribed pages may carry directives:
    # "#exam: ৪৬তম বিসিএস" and "#subject: math" apply to the questions after them (across pages of the file)
    lines, line_page, marks = [], [], {'exam': [], 'subject': []}
    for pid, no, text, st in pages:
        if st != 'done' or not text:
            continue  # scanned / outline-only pages are read visually later
        for line in text.split('\n'):
            d = DIRECTIVE.match(line)
            if d:
                marks[d.group(1)].append((len(lines), d.group(2).strip()))
                continue
            lines.append(line)
            line_page.append((pid, no))
    items = parse('\n'.join(lines)) if lines else []

    track, slug, cls, topic = classify(rel)
    base_sid = bank.subject(slug)
    q_rows, s_rows = [], []
    for it in items:
        pid, no = line_page[min(it['start'], len(line_page) - 1)]
        src = source_label(rel, no, kind)
        exam = latest(marks['exam'], it['start'])
        exam = exam[:120] if exam else exam  # the column holds 120; keep full details in the page text
        # subject: a {slug} tag on the question, else the latest #subject directive, else the file's subject
        tag = None
        for field in ('body', 'stimulus'):
            if it.get(field):
                it[field], t = take_tag(it[field]); tag = tag or t
        if it.get('options'):
            cleaned = []
            for o in it['options']:
                o, t = take_tag(o); tag = tag or t; cleaned.append(o)
            it['options'] = cleaned
        s_slug = tag or latest(marks['subject'], it['start'])
        sid = bank.subject(s_slug) if s_slug in SUBJECTS else base_sid
        tid = bank.topic(sid, topic)
        pictured = it['type'] == 'mcq' and any('[চিত্র' in x for x in [it['body']] + it['options'])
        if it['type'] == 'mcq' and it['answer'] and not pictured:
            o = [x[:500] for x in it['options']]
            body, difficulty, ref = split_meta(it['body'])
            k = qkey(sid, body, o)
            if produced is not None:
                produced['q'][k] = it['answer']
            if k in bank.seen:
                continue
            bank.seen.add(k)
            ref = ref or exam
            q_rows.append((sid, tid, body, o[0], o[1], o[2], o[3], it['answer'], difficulty, src,
                           ref, year_of(ref), 'needs_review' if '[যাচাই]' in (it.get('explanation') or '')
                           or (pid in ocr_pages and ocr_suspect(body, o)) else 'active',
                           pid, cls, it.get('explanation'), k))
            continue
        if it['type'] == 'mcq':
            answer = it['answer']  # set only for picture questions, which stay out of the quiz bank
            kind_, body, options = 'mcq_other', it['body'], json.dumps(it['options'], ensure_ascii=False)
            if it.get('explanation'):
                body += '\n\nব্যাখ্যা/নোট: ' + it['explanation']
        elif it['type'] == 'qa':
            kind_, body, answer, options = it['kind'], it['body'], it['answer'], None
        elif it['type'] == 'creative':
            kind_, body = 'creative', it['stimulus'] + '\n' + '\n'.join(f'({BN_OPT[i]}) {p}' for i, p in enumerate(it['parts']))
            answer, options = None, json.dumps(it['parts'], ensure_ascii=False)
        else:
            kind_, body, answer, options = it['kind'], it['body'], None, None
        h = ikey(sid, kind_, body)
        if produced is not None:
            produced['s'].add(h)
        if h in bank.seen_items:
            continue
        bank.seen_items.add(h)
        s_rows.append((kind_, track, sid, tid, cls, body, answer, options, exam, year_of(exam), src, pid, h))

    if q_rows:
        cur.executemany('''INSERT INTO questions (subject_id, topic_id, body, option_a, option_b, option_c, option_d, correct_option,
                           difficulty, source, exam_ref, year, status, page_id, class_level, explanation, dedup_key)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''', q_rows)
        cur.execute('''INSERT INTO question_versions (question_id, version, snapshot, change_note)
                       SELECT q.id, 1, JSON_OBJECT('body', q.body, 'a', q.option_a, 'b', q.option_b, 'c', q.option_c, 'd', q.option_d,
                              'correct', q.correct_option), 'বই থেকে ইমপোর্ট'
                       FROM questions q JOIN ingest_pages p ON p.id=q.page_id
                       LEFT JOIN question_versions v ON v.question_id=q.id
                       WHERE p.file_id=%s AND v.id IS NULL''', (fid,))
    if s_rows:
        cur.executemany('''INSERT INTO study_items (kind, track, subject_id, topic_id, class_level, body, answer, options,
                           exam_ref, year, source, page_id, dedup_key) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''', s_rows)
    cur.execute("UPDATE ingest_pages SET parsed_at=NOW() WHERE file_id=%s AND text_status='done'", (fid,))
    return len(q_rows), len(s_rows)


def main():
    args = sys.argv[1:]
    limit = int(args[args.index('--limit') + 1]) if '--limit' in args else 10 ** 9
    only = int(args[args.index('--file-id') + 1]) if '--file-id' in args else None
    kinds = ("('doc','docx','rtf')" if '--docs' in args else "('pdf')" if '--pdfs' in args else "('pdf','doc','docx','rtf')")
    db = connect()
    bank = Bank(db)
    cur = db.cursor()
    cur.execute(f'''SELECT f.id, f.path, f.kind FROM ingest_files f
                    WHERE f.kind IN {kinds} AND EXISTS (SELECT 1 FROM ingest_pages p WHERE p.file_id=f.id AND p.parsed_at IS NULL AND p.text_status='done')
                    AND NOT EXISTS (SELECT 1 FROM ingest_pages p WHERE p.file_id=f.id AND p.text_status='pending')
                    AND NOT EXISTS (SELECT 1 FROM ingest_pages p WHERE p.file_id=f.id AND JSON_CONTAINS_PATH(p.text_stats, 'one', '$.visual'))
                    {'AND f.id=%s' if only else ''} ORDER BY f.id LIMIT %s''', ((only, limit) if only else (limit,)))
    files = cur.fetchall()
    tq = ts = twins = 0
    for i, (fid, rel, kind) in enumerate(files, 1):
        r = load_file(bank, fid, rel, kind)
        if r == 'twin':
            twins += 1
        elif r:
            tq += r[0]; ts += r[1]
        if i % 50 == 0:
            print(f'… {i}/{len(files)} files: {tq} questions, {ts} study items', flush=True)
    print(f'✔ load: {len(files)} files → {tq} questions, {ts} study items ({twins} PDFs skipped: same as their .doc)')


if __name__ == '__main__':
    main()
