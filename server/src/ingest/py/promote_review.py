# OCR questions held in needs_review only because of noise around the exam reference ("…: ১৯|", "[CAAB: 21")
# → re-check them without that reference and promote the clean ones. Mixed / cut / garbled items stay in review.
#   python promote_review.py sample   show what would be promoted
#   python promote_review.py apply    promote (writes the ids to promoted_review_ids.json first)
import json
import re
import sys

from extract import connect
from load import ocr_suspect

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
REF = re.compile(r'\s*[\[(।|][^\[(]*[:ঃ]\s*[০-৯0-9\-– ]+[\])|।]?\s*$')  # trailing exam reference
FOREIGN = re.compile(r'(?:^|\s)[কখগঘ]\s*[.)]|উ\s*[.:ঃ]\s*[কখগঘ]|উত্তর|পৃষ্ঠা|(?:^|\s)[০-৯]{1,3}\s*\.\s*\S{2}')


def clean_ok(body, opts):
    b = REF.sub('', body).replace('|', ' ').strip()
    o = [x.replace('|', ' ').strip() for x in opts]
    if len(b) > 400 or any(len(x) > 120 or not x for x in o):
        return False
    if FOREIGN.search(b) or any(FOREIGN.search(x) for x in o):
        return False
    return not ocr_suspect(b, o)


db = connect()
c = db.cursor()
c.execute("""SELECT q.id, q.body, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_option, q.explanation
             FROM questions q JOIN ingest_pages p ON p.id=q.page_id
             WHERE q.status='needs_review' AND JSON_CONTAINS_PATH(p.text_stats,'one','$.cols')""")
rows = c.fetchall()
ok = [r for r in rows if '[যাচাই]' not in (r[7] or '') and clean_ok(r[1], r[2:6])]
print(f'{len(rows)} OCR review questions, {len(ok)} pass the clean check')
if sys.argv[1] == 'sample':
    import random
    for r in random.sample(ok, min(25, len(ok))):
        print(r[:7])
elif sys.argv[1] == 'apply':
    json.dump([r[0] for r in ok], open('promoted_review_ids.json', 'w'))
    for i in range(0, len(ok), 1000):
        c.execute(f"UPDATE questions SET status='active' WHERE status='needs_review' AND id IN ({','.join(str(r[0]) for r in ok[i:i+1000])})")
    print('promoted', len(ok))
