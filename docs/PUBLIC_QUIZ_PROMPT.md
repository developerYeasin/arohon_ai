# Build Prompt — আরোহণ Public Quiz (quiz/)

## Role & goal
You are building a **separate, lightweight public quiz website** for আরোহণ. It is the top of the growth funnel
(PDF Part 29–30): *Social post → free quiz → share result → register in the main app → daily practice → subscription.*
Anyone can play **without logging in**. It must load fast on cheap Android phones over mobile data and feel
worth sharing on Facebook, WhatsApp and Messenger.

## Audience
Bangladeshi students and job seekers arriving from a shared link, mostly on phones, in Bangla.
Three tracks: চাকরি (BCS/ব্যাংক/প্রাইমারি/NTRCA), ভর্তি, একাডেমিক.

## Pages
1. **Home `/`**
   - Hero: "আজকের কুইজ — ১০ প্রশ্ন, ২ মিনিট" + track selector (চাকরি / ভর্তি / একাডেমিক), remembered locally.
   - "আজকের প্রশ্ন" (question of the day): answer inline, see the result and today's % correct.
   - Subject quizzes: one card per subject in the chosen track (10 random questions).
   - Today's top players (nickname board).
   - Footer CTA to the main app.
2. **Quiz `/play/:kind/:id?`** (`kind` = daily | subject)
   - One question per screen, big tap targets, progress bar, per-question 30s soft timer (visual only).
   - No answer reveal during play (so results are comparable); answers submitted at the end.
3. **Result `/result`**
   - Score, time, "আপনি আজ অংশ নেওয়া X% জনের চেয়ে ভালো করেছেন" (real percentile, only when ≥ 5 plays exist).
   - Review of every question with the correct answer and explanation.
   - **Share**: native Web Share; WhatsApp / Facebook / Messenger links; copy link; a downloadable 1080×1080 share-card image drawn on canvas.
   - "Can you beat me?" challenge link: same question set for friends (`/c/:code`).
   - Optional nickname to appear on today's board.
   - Main-app CTA: "আপনার দুর্বল টপিক জানতে ফ্রি অ্যাকাউন্ট খুলুন — ৭ দিনের ট্রায়াল".
4. **Challenge `/c/:code`** — "রহিম পেয়েছেন ৮/১০। আপনি পারবেন?" → plays the exact same questions.

## API (new, public, no auth — `server/src/routes/public.js`, mounted at `/api/public`)
- `GET /tracks` — tracks with their subjects and active-question counts.
- `GET /daily?track=` — today's 10 questions (same for everyone that day, deterministic by date+track). No answers.
- `GET /subject/:id` — 10 random questions from a subject.
- `GET /qotd?track=` — question of the day + today's answer stats.
- `POST /qotd/answer` — record a single answer, return correct option, explanation, % correct.
- `POST /submit` — `{kind, key, question_ids, answers, time_sec, nickname?}` → score, review (correct + explanation), percentile, `play_id`, `challenge_code`.
- `GET /challenge/:code` — the challenger's name/score + the same questions.
- `GET /board?track=` — today's top 20 daily-quiz scores with nicknames.

## Rules
- **Never leak the bank**: only `status='active'` public questions; product (paid) questions are excluded; at most 10 per request; answers only after submission.
- **Honest numbers**: percentile computed from real plays; hide it when too few plays; no fake counts.
- **Abuse limits**: in-memory rate limit per IP; nickname max 30 chars, stripped of links; server recomputes the score — client scores are never trusted.
- **Performance**: no UI library; plain CSS; system + Hind Siliguri font; small bundle; works offline-tolerant (retry messages).
- **Bangla-first**: all copy in Bangla, Bangla digits.
- **Accessibility**: 44px tap targets, focus styles, contrast, `aria-live` for results.
- **Config**: `VITE_API_URL` (empty in dev → Vite proxy), `VITE_APP_URL` (main app URL for CTAs, default http://localhost:5173).

## Done when
Home → daily quiz → result → share/challenge → friend plays the challenge, all working against the real API,
build passes, and the flow is verified in a browser at phone width.
