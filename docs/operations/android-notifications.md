# Android notifications

The Android app receives Firebase Cloud Messaging (FCM) data messages. The relay sends them directly through FCM HTTP v1; an Expo Push account is not required.

## Android compatibility and automated checks

The app's minimum is Android 7.0 (API 24), declared in `app.config.ts` and enforced by the relay's device-registration schema. Compile/target SDK versions follow the locked Expo/React Native toolchain (currently API 36). Notification channels begin at API 26; the notification permission prompt begins at API 33. Live Update promotion requires API 36 and remains subject to system settings and device support. Alerts and ordinary activity cards work below API 36.

On Android 16+, open T3 Code Settings → Live Update Settings to allow status bar chips. Android controls this separately from notification permission. The chip reads `Working` during work, `Approve` for approvals, and `Answer` for input requests; completed work returns to a normal notification. Use an Android 16 QPR2 or newer emulator image to verify the shipped promotion behavior.

API 24–25 use a single inexact system alarm to expire cards after process exit, with no exact-alarm permission. Android can delay that alarm in power-saving modes. API 26+ use notification timeouts. Disabling activity, dismissal, account changes and sign-out cancel the legacy alarm. A stale expiry broadcast cannot remove a newer run's card.

The native notification tests cover API 24, 26, 33 and 36 (plus API 25 for legacy expiry) using Robolectric. To compile the module, run these tests and run Android lint, use the following command from a generated `apps/mobile/android` project with JDK 21 available. No Firebase, signing or relay secrets are required:

```sh
./gradlew :t3-agent-notifications:testDebugUnitTest :t3-agent-notifications:lintRelease -Pandroid.lint.useK2Uast=false
```

Robolectric's API 36 runtime requires JDK 21; module compilation still uses Expo's Java 17 toolchain. The existing Mobile Native Static Analysis job separately runs ktlint and detekt. The native fingerprint check marks this change as requiring a new binary; the production workflow cannot deliver it to an older binary by OTA. Settings disable Android notifications if the installed native module is missing required methods.

The lint command uses the K1 frontend because AGP's K2 frontend crashes while analyzing Worklets 0.10's Gradle Kotlin scripts. This does not disable lint checks. Live Update eligibility must be verified on a device: Robolectric's API 36 image implements older promotion rules that require colorization, while shipped Live Updates require uncolorized notifications.

## Firebase and app build

1. Create a Firebase project and register each Android application identifier you intend to build: `com.t3tools.t3code.dev`, `com.t3tools.t3code.preview`, or `com.t3tools.t3code`.
2. Download `google-services.json`. Set `T3CODE_ANDROID_GOOGLE_SERVICES_FILE` to its path when running Expo prebuild and building the app. The JSON must contain the selected variant's package identifier.
3. Create a service-account key with permission to send FCM messages for that Firebase project. Keep this private JSON outside the repository and the app bundle.
4. Enable the Firebase Cloud Messaging API in the Google project if it is not already enabled. For hosted delivery, set the relay's `FCM_SERVICE_ACCOUNT` secret to the service-account JSON.
5. Build a new Android binary. A JavaScript-only update cannot install the native notification handler or Firebase configuration. Hosted delivery also needs the relay database migration and updated relay deployment; local verification can use the watcher below.

For a local development build, from `apps/mobile`:

```sh
APP_VARIANT=development \
T3CODE_ANDROID_GOOGLE_SERVICES_FILE=/absolute/path/google-services.json \
vp run android:dev
```

For an EAS build, provide the same configuration through each selected build environment, using an EAS file variable named `T3CODE_ANDROID_GOOGLE_SERVICES_FILE` for the Google services file. Make the file available to fingerprint generation as well as the native build. FCM service-account credentials belong on the relay, not in EAS's app environment. If deploying a separate hosted relay, configure the build's T3 Connect public settings for that relay and Clerk application as described in [T3 Connect](../internals/t3-connect.md).

Set `T3CODE_MOBILE_UPDATES_ENABLED=0` before prebuild and bundling a private binary to disable the repository's configured Expo OTA update source. A debug development-client APK requires Metro; a bundled release build is needed to verify cold-start notification taps without Expo's development launcher.

## Clerk sign-in for private builds

Clerk's native Android sign-in uses `clerk://<applicationId>.callback`. In the Clerk instance selected by the build's publishable key, its administrator must allow the exact callback under **Native applications > Allowlist for mobile SSO redirect**. For the development package, add:

```text
clerk://com.t3tools.t3code.dev.callback
```

The app already declares the matching callback receiver. A "redirect url ... does not match an authorized redirect URI" error requires a Clerk configuration change; rebuilding the same APK does not fix it. Reopen sign-in after the administrator saves the entry.

Using T3's existing production publishable key selects the maintainers' Clerk instance. It grants no access to change that instance's allowlist. The chosen package's callback must already be allowed or be added by that instance's administrator. Android device registration and hosted delivery go through the upstream T3 Connect relay, which is not part of this repository. A successful direct-pairing or FCM smoke test does not verify hosted sign-in or device registration.

Building with `APP_VARIANT=production` selects `com.t3tools.t3code` and its corresponding Clerk callback. Set the same variant during prebuild and bundling, and supply a Google services file that includes that package. Keep OTA updates disabled for a private binary. A locally signed build with this package cannot update an official installation signed by the maintainer or coexist with it; removing that installation also removes its app-local data. The development package remains a separate app.

## Native tests

After Android prebuild, run the native presentation regression tests from `apps/mobile/android`:

```sh
./gradlew :t3-agent-notifications:testDebugUnitTest --tests expo.modules.t3agentnotifications.AgentNotificationsTest
```

Delivery itself is exercised against the upstream relay. Android suppresses ordinary alerts while
the app is foregrounded, matching iOS notification presentation. Activity cards still update in the
foreground and retain finished results silently. Check that completion stays quiet with the app
open, that a later completion alerts after backgrounding, and that retrying a foreground-suppressed
alert does not show it later.
