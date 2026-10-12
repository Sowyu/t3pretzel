# t3pretzel

This is a fork of T3 Code that only carries the mobile app. Its purpose is to fix the Android app. The upstream server, web, desktop, marketing, relay, and native desktop code were deleted on purpose. Do not bring them back, and do not add features that need a server change.

## Constraints

- **The app talks to upstream servers.** `packages/contracts` is the wire protocol. Changing it here breaks the app against every released `npx t3` and desktop build. Treat contracts, and the parts of `packages/shared` and `packages/client-runtime` they depend on, as read-only unless the user says otherwise.
- **Android first, iOS still builds.** The React Native code is shared. Fix Android behavior behind `Platform.OS` checks or in the Android native modules. Do not delete iOS branches or the iOS native code; keeping the iOS build green is cheap and keeps upstream diffs readable.
- **Performance.** Users notice a dropped frame, a lying spinner, and a stale label. No continuously repainting animations. Keep list rendering and WebSocket payload handling cheap.

## Where code lives

- `apps/mobile/src` - the app. Features live under `src/features/*`. Android-specific native code is in `apps/mobile/modules/*/android`.
- `apps/mobile/plugins` - Expo config plugins, mostly Android tweaks.
- `packages/contracts` - Effect/Schema wire contracts. `packages/shared` - shared runtime utils, subpath exports, no barrel. `packages/client-runtime` - connection and read-model logic shared with the upstream web client.
- `scripts` - `export-android-icons.ts`, `mobile-native-static-check.ts`, and the third-party license generator Metro loads.
- `native/libghostty-vt` - headers and `VERSION` for the Android terminal's libghostty build (`apps/mobile/modules/t3-terminal/scripts/build-libghostty-android.sh`).

## Dev

- `vp i` installs. Node 24 and pnpm 11 via Vite+.
- From `apps/mobile`: `vp run dev:client` starts Metro for the dev client, `vp run android:dev` prebuilds and runs the Android dev build. See `apps/mobile/README.md`.
- Point the app at a running T3 Code server. From an emulator, the host machine is `http://10.0.2.2:<port>`.
- Never `pkill -f` or kill a PID found by name. Kill only a PID you captured at spawn.

## Verifying

- Smallest proof that the change works. `vp test run <files>` for the tests you touched, targeted lint and typecheck for the scope you changed.
- Do not run repo-wide checks unless asked. CI owns the full suite.
- Test meaningful logic or observable behavior. Do not render components to static markup to assert props.
- Do not launch emulators, browsers, or computer use unless the user agrees.
- Kotlin changes: `vp run lint:mobile` from the repo root runs ktlint and detekt when they are installed.

## Pull requests

- Never open a PR unless asked.
- Conventional commit titles in plain language: `fix(mobile): thread list no longer flickers on Android`.
- UI changes need before/after screenshots from an Android device or emulator.

## Taste

- Complexity belongs at the native module boundary. UI stays dumb.
- Inferred types over annotations. `any` is the enemy.
- Comments describe how a thing is used, and move when the code moves.
- Do not preserve complexity because it already exists. Do not add machinery because it looks impressive.
