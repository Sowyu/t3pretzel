#!/usr/bin/env bash
# Installs the systemd user units that keep the T3 service launcher's active
# version patched. Run once; safe to run again.
set -euo pipefail
here="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
node_bin="$(command -v node)" || { echo "node not found on PATH" >&2; exit 1; }
units="$HOME/.config/systemd/user"
mkdir -p "$units"
cat > "$units/t3-thinking-patch.service" <<UNIT
[Unit]
Description=Patch the active T3 server so it forwards reasoning

[Service]
Type=oneshot
# systemd's user session has a bare PATH; node is wherever it is for this user.
Environment=T3_THINKING_NODE=$node_bin
ExecStart=$here/patch-active-version.sh
UNIT
cat > "$units/t3-thinking-patch.path" <<UNIT
[Unit]
Description=Patch the T3 server whenever the launcher activates a version

[Path]
PathModified=%h/.t3/runtime/service-state.json
Unit=t3-thinking-patch.service

[Install]
WantedBy=default.target
UNIT
systemctl --user daemon-reload
systemctl --user enable --now t3-thinking-patch.path
echo "installed; the active version is patched on the next activation, or now with:"
echo "  systemctl --user start t3-thinking-patch.service   (restarts the server once)"
