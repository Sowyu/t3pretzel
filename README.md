# t3pretzel

A fork of [T3 Code](https://github.com/pingdotgg/t3code) cut down to the mobile app. The goal is to fix up the Android app. The server, web app, desktop app, marketing site, relay, and native desktop helpers from the upstream monorepo are gone.

What is here:

- `apps/mobile`, the Expo / React Native app for Android and iOS.
- `packages/contracts`, `packages/shared`, `packages/client-runtime`, the workspace packages the app imports.
- `scripts`, Android icon export, mobile native lint, and third-party license generation.
- `native/libghostty-vt`, headers and version pin for the Android terminal's libghostty build.

The app talks to any T3 Code server. Run one with `npx t3@latest` or the upstream desktop app.

## Nightly builds

Every push to `main` builds the Android app and publishes it to the rolling [nightly release](https://github.com/Sowyu/t3pretzel/releases/tag/nightly). It is the _nightly_ variant ("T3 Code Nightly", nightly artwork), so it installs next to the Play Store app. arm64-v8a, OTA updates off, T3 Connect on.

Its package id is `com.t3tools.t3code.preview`, the id of T3's internal preview build, because T3's Clerk instance only completes OAuth sign-in for the package ids it lists and this fork cannot add one. Every nightly is signed with one key kept in the `NIGHTLY_KEYSTORE_BASE64` and `NIGHTLY_KEYSTORE_PASSWORD` repository secrets, so each one updates the previous. A fork needs its own: generate a keystore with `keytool`, store it base64-encoded in those two secrets, and set the matching `T3CODE_ANDROID_KEYSTORE_*` variables from `.env.example` for local release builds.

Push notifications need Firebase, and the nightly ships without it by default. The app talks to FCM for its push token, FCM needs a `google-services.json`, and this repo has none, so a stock nightly registers with the relay carrying no push token and no agent push ever arrives. Local notifications are unaffected: while the app is running, a finished turn still posts a notification from the device itself. To turn push on for your own fork, create a Firebase project, add an Android app with the package id `com.t3tools.t3code.preview`, download its `google-services.json`, and store it base64-encoded (`base64 -w0 google-services.json`) in a repository secret named `GOOGLE_SERVICES_JSON`. The workflow decodes it and passes it to the build through `T3CODE_ANDROID_GOOGLE_SERVICES_FILE`; local builds set that variable to a path instead. Pushes are sent by T3's relay, so they also depend on that relay knowing your Firebase project.

Once installed, the app updates itself: Settings → App shows the running commit with a Check button, the app checks the release every six hours, and an Update pill appears in the header when a newer nightly exists. Tapping it downloads the APK, checks its SHA-256 against the release digest plus the package name and signing key, installs it through Android's package installer, and reports the result on the next launch. After the first in-app update the app is its own installer of record, so later updates install without a confirmation dialog.

Coming from the Play Store app: sign in to T3 Connect with the same account and your linked environments appear under Connections with a "Connect all" button. Directly paired environments (LAN, Tailscale) have to be paired again from the desktop app's Settings → Connections, since pairing tokens belong to one install.

## Setup

Install [Vite+](https://viteplus.dev/guide/), then:

```bash
vp i
cd apps/mobile
vp run android:dev
```

[apps/mobile/README.md](./apps/mobile/README.md) covers variants, EAS builds, and native lint. Docs for the parts that remain are in [docs/](./docs).

Licensed under the [MIT License](./LICENSE), same as upstream.
