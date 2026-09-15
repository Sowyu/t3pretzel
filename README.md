# t3pretzel

A fork of [T3 Code](https://github.com/pingdotgg/t3code) cut down to the mobile app. The goal is to fix up the Android app. The server, web app, desktop app, marketing site, relay, and native desktop helpers from the upstream monorepo are gone.

What is here:

- `apps/mobile`, the Expo / React Native app for Android and iOS.
- `packages/contracts`, `packages/shared`, `packages/client-runtime`, the workspace packages the app imports.
- `scripts`, Android icon export, mobile native lint, and third-party license generation.
- `native/libghostty-vt`, headers and version pin for the Android terminal's libghostty build.

The app talks to any T3 Code server. Run one with `npx t3@latest` or the upstream desktop app.

## Setup

Install [Vite+](https://viteplus.dev/guide/), then:

```bash
vp i
cd apps/mobile
vp run android:dev
```

[apps/mobile/README.md](./apps/mobile/README.md) covers variants, EAS builds, and native lint. Docs for the parts that remain are in [docs/](./docs).

Licensed under the [MIT License](./LICENSE), same as upstream.
