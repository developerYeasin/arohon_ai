# Ingest — resume notes (for the next session)

- ✅ File 3419 (ইসলামী ব্যাংক ২০০৩-২০২৫ প্রশ্নব্যাংক, 165p) — **সম্পূর্ণ** (2315 questions + 76 study items)।
- Next: run `python visual.py queue` in `server/src/ingest/py` and take the top file (currently **3416 — 4. Job Wise Pdf\Bank Pdf\Islami Bank Question Bank.pdf**, 7p; then 3556 NTRCA Question Bank 1-17th, 195p).
- Workflow per batch: `python visual.py render <file> <from> <n>` → read images → write transcript (`=== page <page id>`, `#exam:`, `#subject:`, `{slug}` tags, `[উ: X]`, `নোট: [যাচাই] …` for wrong/doubtful book answers) → `python visual.py commit <file> <transcript> 0` → `python visual.py clean`.
- Rules: book answer provably wrong → store the correct one + `নোট: [যাচাই]`; no printed answer → omit `[উ:]` (study item); never end a page with a `[চিত্র: …]` line; finish an exam's pages together (a page beginning mid-exam needs that exam's `#exam:` line); identical stems get merged by dedup → add option words to the stem; upside-down scans → rotate the JPG 180° with PIL; duplicate pages → write a one-line note instead of re-transcribing.

