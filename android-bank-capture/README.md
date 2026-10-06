# PD Rich Sync (Android companion app)

PD Rich Sync forwards bank balance-change notifications from the phone to Money Tracker. It listens to the bank apps the user ticks (VCB Digibank, Timo, OCB OMNI, digimi/BV). From Gmail it keeps only bank emails, matched by sender name. Each notification's raw text goes into Firestore `bankInbox`, and the web app parses it (`src/services/bankImport/`).

- Kotlin, with no libraries besides the Android SDK. Firebase Auth and Firestore are reached over REST, using the same web API key and login as Money Tracker. Only the refresh token is stored, never the password.
- Captured items are queued in a file and retried when the network is back (JobScheduler), including after a reboot.
- Notifications containing an OTP are always dropped.
- The UI is English, or Vietnamese on a phone set to Vietnamese.

## Build

```bash
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
./gradlew assembleDebug
```

Build outputs go to `C:/tmp/money-tracker-android-build/` (outside Dropbox), and the APK ends up at `app/outputs/apk/debug/app-debug.apk`. `local.properties` needs `sdk.dir=C:/Users/<you>/AppData/Local/Android/Sdk`.

## Install / update on a phone

Vietnamese bank apps refuse to run while Developer options are on, so turn them on only while installing:

1. On the phone, enable Developer options by tapping Settings → About phone → (Software information) → **Build number** 7 times. Then turn on **USB debugging**.
2. Connect the cable and allow the computer.
3. Run `adb install -r app-debug.apk` (adb is in the SDK's `platform-tools`).
4. Turn Developer options **off** again.

Updating keeps the sign-in, the notification access and the chosen apps.

## First run on a phone

Sign in with the Money Tracker account, then work through the app's setup:

1. **Grant access** for notification access.
2. **Allow** background running, so Samsung doesn't kill the app.
3. **Choose apps** and tick the bank apps, plus Gmail.
4. **Send test** should show "✅ Sent".
