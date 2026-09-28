# আরোহণ অনলাইন পরীক্ষা (quiz)

Google-Form-style link exams. Teachers and admins log in, build an exam, publish it and share the link;
anyone with the link enters their name and sits the exam.

## Teacher / admin (`/login`, then `/`)
- Create exams; add questions one by one or paste many at once (📋 bulk paste).
- Question types: one correct answer, several correct answers (all must match), written answer (auto-matched; several accepted answers separated by `|`), images on questions and options.
- Settings: timer (minutes), marks per question (per-question override), negative mark per wrong answer, pass mark, start/end time, password, one attempt per name/device, shuffle questions/options, when students see results (immediately / after the end time / never), show answers & explanations, leaderboard.
- Publish → link + QR code + WhatsApp/Facebook share. Close the exam at any time.
- Results: live list (refreshes every 15 s), rank, pass/fail, each student's answer sheet, per-question analysis (which option people picked), CSV export for Excel; delete a submission to allow a retake.

## Student (`/e/<code>`)
- Name (and password if set) → timer starts. The answers autosave to the phone and the server. Refreshing or reopening the link resumes the same attempt. When time runs out the answers are submitted automatically.
- Result: score with negative marking, correct/wrong/skipped counts, rank, leaderboard, and answers with explanations (if the teacher allows).

## Run
```bash
npm install
npm run dev        # http://localhost:5180
npm run build      # static files in dist/ — serve with SPA fallback to index.html
```
`.env`: `VITE_API_URL` = the API server (empty in development, where Vite proxies `/api` to `localhost:5000`).
Add the quiz site's origin to the server's `CLIENT_ORIGIN`.

API: `server/src/routes/forms.js` (`/api/forms`); tables `exam_forms`, `exam_form_questions`, `exam_form_submissions` (created automatically on server start).
