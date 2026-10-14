# Keeps N OCR shards running (restarts any that exit) and logs progress every 10 minutes.
#   python ocr_watch.py [N] [MINUTES]   default 2 workers, run for 110 minutes then exit (workers keep running)
import os
import subprocess
import sys
import time

from extract import connect

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
N = int(sys.argv[1]) if len(sys.argv) > 1 else 2
END = time.time() + 60 * (int(sys.argv[2]) if len(sys.argv) > 2 else 110)
LOGS = os.path.join(os.environ['TEMP'], 'claude', 'ocrlogs')
os.makedirs(LOGS, exist_ok=True)
HERE = os.path.dirname(os.path.abspath(__file__))


def running():
    out = subprocess.run(['powershell', '-NoProfile', '-c',
                          "Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | "
                          "? { $_.CommandLine -like '*ocr.py all*' } | % { $_.CommandLine }"],
                         capture_output=True, text=True).stdout
    return {s for s in range(N) if f'all {s}/{N}' in out}


def start(s):
    log = open(os.path.join(LOGS, f'n{N}_w{s}.log'), 'a', encoding='utf-8')
    subprocess.Popen([sys.executable, 'ocr.py', 'all', f'{s}/{N}'], cwd=HERE, stdout=log, stderr=log,
                     creationflags=subprocess.BELOW_NORMAL_PRIORITY_CLASS)
    print(time.strftime('%H:%M'), f'started shard {s}/{N}', flush=True)


def stats():
    c = connect().cursor()
    c.execute("SELECT status, COUNT(*) FROM questions GROUP BY status")
    q = dict(c.fetchall())
    c.execute("SELECT SUM(JSON_CONTAINS_PATH(text_stats,'one','$.ocr')), SUM(text_status='needs_visual') FROM ingest_pages")
    o, left = c.fetchone()
    return int(o or 0), int(left or 0), q.get('active', 0), q.get('needs_review', 0)


# workers grow (Python keeps the memory of each load's key sets): start every round with fresh ones
subprocess.run(['powershell', '-NoProfile', '-c',
                "Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | "
                "? { $_.CommandLine -like '*ocr.py all*' } | % { Stop-Process -Id $_.ProcessId -Force }"])
time.sleep(3)
last = 0
while time.time() < END:
    alive = running()
    for s in range(N):
        if s not in alive:
            start(s)
    if time.time() - last >= 600:
        try:
            o, left, a, r = stats()
            print(time.strftime('%H:%M'), f'workers {len(alive)}/{N} · ocr pages {o} · left {left} · active {a} · review {r}', flush=True)
        except Exception as e:
            print(time.strftime('%H:%M'), 'stats failed:', e, flush=True)
        last = time.time()
    time.sleep(60)
o, left, a, r = stats()
print(time.strftime('%H:%M'), f'END · ocr pages {o} · left {left} · active {a} · review {r}', flush=True)
