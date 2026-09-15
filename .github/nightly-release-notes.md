Rolling nightly build of the t3pretzel Android app from `main`.

**Install:** download the APK and open it on the phone. It is the _nightly_ variant (`com.t3tools.t3code.nightly`, app name "T3 Code Nightly") and installs next to the Play Store app. arm64-v8a only. Signed with the standard Android debug keystore, so each nightly updates the previous one, and it can never replace or be replaced by the store app.

**Coming from the Play Store app**

- Environments linked to T3 Connect: sign in with the same account in Settings and they appear under Connections, ready to connect.
- Environments paired directly (LAN, Tailscale): pairing tokens belong to one app install, so add them again from the desktop app's Settings → Connections with the QR code.
- Appearance and other on-device preferences do not carry over.
