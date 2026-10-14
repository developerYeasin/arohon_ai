"""Re-run the parser over files that are already loaded, after a parser fix.

For each file: items the fixed parser now finds are inserted (anything already in the bank is skipped by its
dedup key), answers that changed are updated, and the file's rows the fixed parser no longer produces (the
broken splits of the old parse) are removed — unless someone has used them (attempts, bookmarks, tests…),
in which case they are only marked needs_review. Rows that did not change keep their ids.

    python reparse.py FILE_IDS.json [AUDIT.jsonl]   # a JSON list of ingest_files ids; removed rows go to AUDIT
"""
import json
import sys
import time

from extract import connect
from load import Bank, load_file

AUDIT = None  # file that receives every removed row (reparse.py IDS.json AUDIT.jsonl)
USES = ('attempt_answers', 'bookmarks', 'discussions', 'product_questions', 'question_reports', 'review_items',
        'test_questions')


def used(cur, ids):
    if not ids:
        return set()
    q = ','.join(map(str, ids))
    out = set()
    for t in USES:
        cur.execute(f'SELECT DISTINCT question_id FROM {t} WHERE question_id IN ({q})')
        out |= {r[0] for r in cur.fetchall()}
    return out


def reparse(bank, fid):
    cur = bank.db.cursor()
    cur.execute('SELECT path, kind FROM ingest_files WHERE id=%s', (fid,))
    rel, kind = cur.fetchone()
    cur.execute('''SELECT q.id, q.dedup_key, q.correct_option FROM questions q JOIN ingest_pages p ON p.id=q.page_id
                   WHERE p.file_id=%s''', (fid,))
    old_q = cur.fetchall()
    cur.execute('''SELECT s.id, s.dedup_key FROM study_items s JOIN ingest_pages p ON p.id=s.page_id
                   WHERE p.file_id=%s''', (fid,))
    old_s = cur.fetchall()

    produced = {'q': {}, 's': set()}
    r = load_file(bank, fid, rel, kind, produced)
    if not isinstance(r, tuple):
        return None  # twin / unread: leave the file as it is
    added_q, added_s = r

    fixed = [(produced['q'][k], i) for i, k, a in old_q if k in produced['q'] and produced['q'][k] != a]
    if fixed and AUDIT:
        was = {i: a for i, _, a in old_q}
        for a, i in fixed:
            AUDIT.write(json.dumps({'file': fid, 'table': 'answer', 'id': i, 'was': was[i], 'now': a}) + chr(10))
    if fixed:
        cur.executemany('UPDATE questions SET correct_option=%s WHERE id=%s', fixed)
    stale_q = [i for i, k, _ in old_q if k not in produced['q']]
    stale_s = [i for i, k in old_s if k not in produced['s']]
    keep = used(cur, stale_q)
    if keep:
        cur.execute(f"UPDATE questions SET status='needs_review' WHERE id IN ({','.join(map(str, keep))})")
    drop = [i for i in stale_q if i not in keep]
    if AUDIT and (drop or stale_s):
        for table, ids in (('questions', drop), ('study_items', stale_s)):
            if ids:
                cur.execute(f"SELECT id, body FROM {table} WHERE id IN ({','.join(map(str, ids))})")
                for i, b in cur.fetchall():
                    AUDIT.write(json.dumps({'file': fid, 'table': table, 'id': i, 'body': b}, ensure_ascii=False) + '\n')
    if drop:
        q = ','.join(map(str, drop))
        cur.execute(f'DELETE FROM question_versions WHERE question_id IN ({q})')
        cur.execute(f'DELETE FROM questions WHERE id IN ({q})')
    if stale_s:
        cur.execute(f"DELETE FROM study_items WHERE id IN ({','.join(map(str, stale_s))})")
    bank.seen -= {k for i, k, _ in old_q if i in set(drop)}
    bank.seen_items -= {k for i, k in old_s if k not in produced['s']}
    bank.db.commit()
    return added_q, added_s, len(fixed), len(drop), len(keep), len(stale_s)


def main():
    global AUDIT
    ids = json.load(open(sys.argv[1]))
    if len(sys.argv) > 2:
        AUDIT = open(sys.argv[2], 'a', encoding='utf-8')
    db = connect()
    bank = Bank(db)
    tot = [0] * 6
    t0 = time.time()
    for n, fid in enumerate(ids, 1):
        r = reparse(bank, fid)
        if r:
            tot = [a + b for a, b in zip(tot, r)]
        if n % 50 == 0 or n == len(ids):
            print(f'… {n}/{len(ids)} files: +{tot[0]} q, +{tot[1]} items, {tot[2]} answers fixed, '
                  f'-{tot[3]} q, -{tot[5]} items, {tot[4]} kept (in use) {time.time() - t0:.0f}s', flush=True)


if __name__ == '__main__':
    main()
