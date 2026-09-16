#!/usr/bin/env bash
# Patches the T3 version the service launcher currently runs, and restarts the
# server child when it is still executing an unpatched copy. Wired to a
# systemd path unit on ~/.t3/runtime/service-state.json, so every nightly the
# launcher activates gets patched, then relaunched once, by the launcher's own
# restart policy.
set -euo pipefail

t3_home="${T3CODE_HOME:-$HOME/.t3}"
here="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
patcher="$here/../patch.mjs"
node_bin="${T3_THINKING_NODE:-$(command -v node || printf '/usr/bin/node')}"
state="$t3_home/runtime/service-state.json"
marker='/\* t3-thinking \*/'

[ -f "$state" ] || exit 0
read -r active pending < <("$node_bin" -e '
  const s = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
  console.log(s.activeVersion, s.update && s.update.status === "pending" ? "pending" : "settled");
' "$state")
bin="$t3_home/runtime/versions/$active/t3"
[ -f "$bin" ] || exit 0

if ! "$node_bin" "$patcher" "$bin" --check >/dev/null 2>&1; then
  if ! "$node_bin" "$patcher" "$bin"; then
    echo "t3-thinking: could not patch $active; the server runs unpatched" >&2
    exit 0
  fi
fi

# While the launcher trials a new version, an exiting child means rollback.
# Wait for the state to settle; the path unit fires again when it does.
[ "$pending" = settled ] || exit 0

for exe in /proc/[0-9]*/exe; do
  pid="${exe#/proc/}"
  pid="${pid%/exe}"
  target="$(readlink "$exe" 2>/dev/null || true)"
  case "$target" in
    "$bin" | "$bin (deleted)") ;;
    *) continue ;;
  esac
  args="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
  case "$args" in *" serve"*) ;; *) continue ;; esac
  if ! grep -a -q "$marker" "$exe" 2>/dev/null; then
    if [ "${T3_THINKING_DRY_RUN:-}" = 1 ]; then
      echo "t3-thinking: would restart t3 serve (pid $pid), it runs an unpatched $active"
      continue
    fi
    echo "t3-thinking: restarting t3 serve (pid $pid) so it loads the patched $active"
    kill -TERM "$pid"
  fi
done
