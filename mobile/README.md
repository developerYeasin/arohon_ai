# আরোহণ — Mobile (Expo / React Native)

Android & iOS app for students. Uses the same Node API as the web app (`../server`).

## Run on your phone (fastest)
1. Start the API: `cd ../server && npm run dev`
2. Find your PC's LAN IP (`ipconfig` → IPv4, e.g. `192.168.0.105`) and put it in `mobile/.env`:
   `EXPO_PUBLIC_API_URL=http://192.168.0.105:5000`
3. `npm install` then `npx expo start`
4. Install **Expo Go** from Play Store and scan the QR code (phone and PC on the same Wi-Fi).

Android emulator: keep `EXPO_PUBLIC_API_URL=http://10.0.2.2:5000`.

## Build an APK
`npx eas-cli@latest build --platform android --profile preview` (set your real API URL in `eas.json` first).
Play Store: `--profile production`, then `npx eas-cli@latest submit -p android`.

## What's in the app
Login / register / password reset, home (readiness, today's mission, "I have N minutes"), practice & adaptive tests,
exam player (timer, OMR grid, confidence, instant feedback, offline-safe answers), diagnostic report with mistake reasons,
mistakes & smart revision, analytics, weekly planner, live exams & leaderboards, AI coach, current affairs,
exam pass (bKash / manual TrxID), profile & achievements.
Written practice, mock viva, battles and study groups are on the website for now.
