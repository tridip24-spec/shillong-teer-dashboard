# Android Wrapper

This folder contains a simple Android WebView app for the deployed website.

## Before building

1. Deploy the website and get the live HTTPS URL.
2. Open `android-wrapper/app/build.gradle`.
3. Add this line inside `defaultConfig`:

```gradle
buildConfigField "String", "APP_BASE_URL", "\"https://YOUR-LIVE-URL.onrender.com/\""
```

Example:

```gradle
buildConfigField "String", "APP_BASE_URL", "\"https://shillong-teer-dashboard.onrender.com/\""
```

## Build in Android Studio

1. Open the `android-wrapper` folder in Android Studio.
2. Let Gradle sync.
3. Build:
   - `Build > Generate Signed Bundle / APK`
   - choose `Android App Bundle`
4. Export the `.aab` file for Play Console.

## Recommended Play Store setup

- App name: `Shillong Teer Insights`
- Category: `Tools`
- Age rating: complete in Play Console honestly
- Website: your deployed app URL
- Privacy policy: `https://YOUR-LIVE-URL/privacy.html`
- Disclaimer: `https://YOUR-LIVE-URL/disclaimer.html`

## Monetization later

If you later add ad revenue, use Google AdMob inside the Android wrapper after the Play Store app is stable and policy-safe.
