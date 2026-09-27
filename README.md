# আরোহণ (Arohon) — Personal Exam-Preparation System

An exam-prep platform for Bangladesh covering **Academic** (SSC/HSC), **Admission** (DU, Medical, GST) and **Job** (BCS, Bank, Primary, NTRCA) exams.
It's built as a personal preparation system rather than another MCQ question bank.

```
arohon_ai/
├── server/   Node.js + Express + MySQL API
├── client/   React (Vite) web app
└── mobile/   React Native (Expo) Android/iOS app — see mobile/README.md
```

## Quick start

Requirements: Node.js 20+ and a MySQL 8 database (credentials go in `server/.env`).

```bash
# 1) API
cd server
npm install
npm run seed            # creates tables + starter content + demo accounts (skips if already seeded)
npm run dev             # http://localhost:5000

# 2) Web app (new terminal)
cd client
npm install
npm run dev             # http://localhost:5173  (proxies /api → :5000)
```

Demo accounts are created by the seed from the `SEED_*` values in `server/.env`
(admin, teacher, a student on a 7-day trial, and a free-tier student).

> Change these passwords and `JWT_SECRET` before deploying. `npm run seed -- --fresh` **drops all tables** and reseeds.

### Optional: LLM-powered AI Coach
The coach works without any API key by using a built-in rule engine grounded in the student's data. To have Claude write the replies, set `ANTHROPIC_API_KEY` in `server/.env`. The model defaults to `claude-opus-5` and can be changed with `CLAUDE_MODEL`. Server-side refusal fallback is enabled. The rule engine still supplies the action buttons, and it takes over if the API call fails.

### Production
`cd client && npm run build` produces `client/dist/`. Serve it from any static host and set `VITE_API_URL` to the API origin at build time. Set `CLIENT_ORIGIN` in `server/.env` for CORS.

## What's built (mapped to the product brief)

| Brief part | Where |
|---|---|
| Exam Readiness Profile & score (P5, P8): per-subject readiness, accuracy, time management, consistency, retention, simulation, projected marks, weakest topic, biggest risk, recommended action | `server/src/services/engine.js → readiness()`, `/app/analytics`, dashboard |
| Adaptive exam engine (P6): weak-topic × exam-relevance weighting, due revisions, freshness, difficulty fit, per-topic caps | `engine.js → pickAdaptive()` |
| Real exam simulator (P9): real subject distribution, timer, negative marking, OMR grid, no-pause, auto-submit, rank/percentile | `/exam/:id` (`ExamPlayer.jsx`), `tests.js /mock` |
| Diagnostic report (P9): "knew X% but scored Y%", late-exam accuracy drop, over-time per subject, guess profitability | `services/attempts.js → buildReport()` |
| Mistake Intelligence (P10): 9 mistake types, auto-classified from time/confidence/history, student override, per-type remedies and re-tests | `services/mistakes.js`, `/app/mistakes` |
| Spaced repetition (P11): Leitner 1-3-7-16-35 days, "N questions to review today" | `engine.js → updateReview()` |
| AI Coach (P7): today's plan, why losing marks, revise, improving, weak areas, N-days-left plan, what to drop, N-minute session | `services/coach.js`, `/app/coach` |
| Today's Mission and time-boxed sessions (P19, P20) | `engine.js → getMission(), buildSession()` |
| Exam-specific dashboards (P21), PYQ intelligence (P22) with responsible wording (P23) | `/app`, `/app/intelligence` |
| Live exams, leaderboards (national/district/institution, district-vs-district), friend challenges (P13, P29) | `/app/live`, `/app/leaderboard` |
| Community per question: discussion, votes, expert-verified answers (P14) | `QuestionTools.jsx` |
| Question quality pipeline (P15): reports → auto-quarantine at 3 reporters → expert fix → version history | `admin.js /reports`, `question_versions` |
| Question analytics (P34): accuracy, skip rate, discrimination, common wrong option, label-vs-empirical difficulty flags | Admin → প্রশ্নের মান |
| Current-affairs engine (P17): news → key facts → MCQs → weekly test | `/app/current-affairs` |
| Teacher dashboard (P33): at-risk students, improvement, class weak topics | Admin → শিক্ষার্থী |
| Anti-cheat basics (P35): one attempt per live exam, answers hidden until the live exam ends, implausibly fast perfect runs flagged and excluded from rankings | `attempts.js`, `tests.js` |

## Not built yet (next phases)
- Payments (bKash/Nagad) and plan enforcement. The pricing on the landing page is a proposal; right now every feature is free.
- Written-answer evaluation and viva simulation (Phase 5)
- Creator marketplace (Phase 4) and full B2B batches/private exams (Phase 6)
- The seed has only ~200 **sample** questions. Import real previous-year questions with `year` + `exam_ref` (Admin → প্রশ্নব্যাংক → JSON ইমপোর্ট) to populate PYQ intelligence.
