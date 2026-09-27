# আরোহণ — Public Quiz (quiz/)

Login-free quiz site: the top of the growth funnel (social post → quiz → share → sign up).
Spec: `../docs/PUBLIC_QUIZ_PROMPT.md`. API: `server/src/routes/public.js` (`/api/public/*`).

```bash
npm install
npm run dev      # http://localhost:5180  (needs the API on :5000)
npm run build    # set VITE_API_URL and VITE_APP_URL in .env for production
```

Pages: home (track picker, today's quiz, question of the day, subject quizzes, today's board),
play, result (percentile, review, WhatsApp/Facebook/Messenger share, 1080×1080 share image, nickname),
and `/c/:code` friend challenges (same 10 questions).
