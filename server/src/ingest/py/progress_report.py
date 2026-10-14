"""Write D:/arohon_ai/INGEST_PROGRESS.md: which folders are done and which remain (python progress_report.py).

Folder names only (top level and one level below) — no file names. Technical resume notes live in ../RESUME.md.
"""
import datetime
from collections import defaultdict

from extract import connect

OUT = "D:/arohon_ai/INGEST_PROGRESS.md"
c = connect().cursor()
c.execute("SELECT text_status, COUNT(*) FROM ingest_pages GROUP BY text_status")
st = dict(c.fetchall()); tot = sum(st.values()); done = st.get('done', 0)
c.execute("SELECT COUNT(*) FROM questions"); q = c.fetchone()[0]
c.execute("SELECT COUNT(*) FROM study_items"); s = c.fetchone()[0]
c.execute("""SELECT f.path, SUM(p.text_status='done'), COUNT(*)
             FROM ingest_files f JOIN ingest_pages p ON p.file_id=f.id GROUP BY f.id, f.path""")
rows = c.fetchall()

# folder -> [pages done, pages total, files fully done, files total]
agg = defaultdict(lambda: [0, 0, 0, 0])
for path, d, n in rows:
    parts = path.replace('/', '\\').split('\\')
    keys = [parts[0]] + (['\\'.join(parts[:2])] if len(parts) > 2 else [])
    for k in keys:
        a = agg[k]; a[0] += int(d); a[1] += n; a[2] += int(d) == n; a[3] += 1


def pct(a):
    return f"{a[0]*100/a[1]:.0f}%"


tops = sorted(k for k in agg if '\\' not in k)
subs = lambda t: sorted(k for k in agg if k.startswith(t + '\\'))
name = lambda k: k.split('\\')[-1]
done_f = [t for t in tops if agg[t][0] == agg[t][1]]
run_f = [t for t in tops if 0 < agg[t][0] < agg[t][1]]
todo_f = [t for t in tops if agg[t][0] == 0]

L = ["# PDF ingest — কোন ফোল্ডার হয়েছে, কোনটা বাকি\n",
     f"আপডেট: {datetime.datetime.now():%Y-%m-%d %H:%M} · মোট কাজ {done*100/tot:.0f}% · "
     f"প্রশ্ন {q}, স্টাডি আইটেম {s}\n",
     f"## ✅ সম্পূর্ণ ফোল্ডার ({len(done_f)})"]
L += [f"- {name(t)}" for t in done_f] or ["- (এখনো কোনোটা পুরো শেষ হয়নি)"]
L += ["", f"## 🔶 অর্ধেক হয়েছে ({len(run_f)})"]
for t in run_f:
    L.append(f"- **{name(t)}** — {pct(agg[t])}")
    for k in subs(t):
        a = agg[k]
        mark = '✅ শেষ' if a[0] == a[1] else ('⬜ বাকি' if a[0] == 0 else pct(a))
        L.append(f"  - {name(k)} — {mark}")
L += ["", f"## ⬜ একদম শুরু হয়নি ({len(todo_f)})"]
L += [f"- {name(t)}" for t in todo_f] or ["- (নেই)"]
L.append('')
open(OUT, 'w', encoding='utf-8').write('\n'.join(L))
print('\n'.join(L[:3]))
