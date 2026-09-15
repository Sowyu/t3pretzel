Rolling nightly build of the t3pretzel Android app from `main`.

**Install:** download the APK and open it on the phone. arm64-v8a only. The app is called "T3 Code Nightly" and installs next to the Play Store app. Its package id is `com.t3tools.t3code.preview`, the same one T3's internal preview builds use, because T3's sign-in service only completes OAuth for the package ids it knows. Every nightly is signed with the same key, so each one updates the previous. If you installed a nightly before 2026-09-15, uninstall it once; that build carried a throwaway key.

**Coming from the Play Store app**

- Environments linked to T3 Connect: sign in with the same account in Settings and they appear under Connections, ready to connect.
- Environments paired directly (LAN, Tailscale): pairing tokens belong to one app install, so add them again from the desktop app's Settings → Connections with the QR code.
- Appearance and other on-device preferences do not carry over.
