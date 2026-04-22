# Play Store Launch Guide

## Important first

Google Play is not fully free to publish on. As of April 17, 2026, Google requires a **one-time US$25 developer registration fee** for a Play Console account.

Also, apps in gambling, lottery, and betting-related categories can face stricter review. If you want the best chance of approval, the safest public Play Store version is:

- results and history
- informational analysis
- disclaimers and privacy policy
- no money handling
- no wagering flow

## Current app status

This project now includes:

- copyright footer
- clear disclaimer and privacy page
- auto refresh every 60 seconds
- web app manifest
- service worker

## Best low-cost launch path

1. Deploy the app to a public HTTPS URL.
2. Confirm the site works on mobile.
3. Create a Play Console account.
4. Use a lightweight Android wrapper around the hosted web app, or package it as a PWA-based Android app.
5. Upload screenshots, app icon, privacy policy URL, and disclaimer text.
6. Submit for review.

## If your Play Console account is personal

Google currently requires newer personal developer accounts to complete closed testing before
production release. The official requirement is at least 12 opted-in testers for 14 continuous
days before you can apply for production access.

You may also need device verification and standard identity/contact verification in Play Console.

## Recommended submission notes

- App category: `Tools` or `News & Magazines` is safer than anything gambling-related.
- Store description should say the app is for public result information and historical analysis only.
- Do not claim guaranteed numbers, winning tips, betting advice, or financial benefit.
- Do not include payment, wallet, bid, deposit, or gambling account features.

## Assets you still need

- 512x512 Play Store icon
- Feature graphic
- 2 to 8 phone screenshots
- Public privacy policy URL
- Public disclaimer URL

## Monetization later

The safest way to add revenue later is to deploy the app first, get the Play Store wrapper approved,
and then add Google AdMob to the Android wrapper in a later update.

Avoid adding aggressive ads, gambling-themed ads, or any ad copy that looks like betting advice.

## Before submission

- Review whether the trend-insights section should remain in the Play Store build.
- If Google flags it as gambling-support functionality, publish an information-only build that keeps:
  - live results
  - past history
  - house and ending trend charts
  - disclaimer and privacy pages

## Useful official links

- Play Console getting started: https://support.google.com/googleplay/android-developer/answer/6112435
- Registration fee/payment info: https://support.google.com/googleplay/android-developer/answer/9875040
- Developer Program Policies: https://support.google.com/googleplay/android-developer/answer/16070163
- Gambling policy area: https://support.google.com/googleplay/android-developer/answer/9877032
- Testing requirements for personal accounts: https://support.google.com/googleplay/android-developer/answer/14151465
