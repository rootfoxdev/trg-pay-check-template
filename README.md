# TRG Pay Check

Android app that predicts a TRG payslip from your daily start and finish times, so you can check it line by line against the real one.

- Everything stays on your phone (IndexedDB inside the app). No server, no account, no network calls.
- Download payslip: makes a PDF in the same section order as a TRG payslip, marked as a prediction.
- The rules came from one driver's FY2026-27 payslips plus the Road Transport and Distribution Award (MA000038) pay guide. **Your grade, rates, loyalty year and allowances may be different.** Change them in the app's Setup screen, and check `PAY-RULES.md` against your own payslips.

## Make your own copy (phone is fine)

1. On this repo's GitHub page, tap **Use this template** → **Create a new repository**.
2. Choose **Private**. This matters: the first build saves your app's signing key in your repo, and a public repo would let anyone copy it.
3. Open the **Actions** tab in your new repo. The first build starts by itself (or tap **Build APK** → **Run workflow**).
4. When it's done, open **Releases** and install the APK on your phone.
5. To change something, edit the files (or give your Claude the repo) and push to `main`. Each push builds a new APK that installs over the old one, and your saved weeks stay on the phone.

Don't delete `android/app/release.keystore` or `android/app/keystore.password` from your copy. Without them, the next APK won't install over the old one, and you'd have to uninstall and lose your saved weeks (export a backup first).

Forking this repo publicly won't build: a public repo with no signing secrets stops on purpose. Use the template as above, or add `KEYSTORE_B64` and `KEYSTORE_PASSWORD` as repo secrets.

## Working on it with Claude

Read `PAY-RULES.md` first. It lists every pay rule, the evidence for it, and open questions. The pay engine is `www/engine.js`, and the default rates are near the top of it.

## Layout

- `www/` the app (HTML, CSS, JS, fonts, PDF library)
- `android/` Capacitor Android project
- `.github/workflows/build-apk.yml` the build
