# GitHub Ready Checklist

## Before pushing

1. Create a new GitHub repository.
2. Upload all files from this project folder.
3. Make sure these important files are included:
   - `server.js`
   - `package.json`
   - `public/`
   - `render.yaml`
   - `DEPLOYMENT_GUIDE.md`
   - `PLAYSTORE_LAUNCH.md`
   - `android-wrapper/`

## Suggested repository name

`shillong-teer-dashboard`

## Suggested description

Shillong Teer daily results, one-year history, and informational trend insights dashboard.

## After pushing

1. Open the repository on GitHub.
2. Confirm `render.yaml` is visible in the root.
3. Connect the repository to Render or Koyeb.
4. Deploy and wait for the first public URL.
5. Replace the placeholder URL in the Android wrapper before building the Play Store app.

## Important

- Do not upload secrets or payment credentials.
- If you later add AdMob, keep the real app IDs out of public commits until you are ready.
