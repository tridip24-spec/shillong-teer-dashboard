# Deployment Guide

## Easiest option: Render

This project is ready for a simple Node deployment on Render.

## Steps

1. Push this project to GitHub.
2. Go to https://render.com and sign in.
3. Click `New +`.
4. Choose `Blueprint` if Render detects `render.yaml`, or choose `Web Service`.
5. Connect your GitHub repository.
6. Confirm:
   - Build command: `npm install`
   - Start command: `npm start`
7. Deploy.
8. After deployment, open the public HTTPS URL and test:
   - `/`
   - `/api/dashboard`
   - `/privacy.html`
   - `/disclaimer.html`

## Notes

- The app uses `PORT`, so it is deployment-friendly.
- The app fetches public Shillong Teer pages live and falls back to local cache when needed.
- Free hosting tiers may sleep when idle.

## After deployment

Use your live HTTPS URL for:

- Play Store privacy policy link
- Play Store website field
- Android wrapper or webview app

## Next Android step

Once the site is live, create an Android wrapper around the deployed URL and build an `.aab` for Play Console submission.
