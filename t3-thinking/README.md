# t3-thinking

Run a patched local copy of the T3 nightly server. The patch forwards provider reasoning deltas as `thread.activity.append` rows, so existing clients can ignore them and clients that know `reasoning.text` can rebuild each item by joining summaries in `seq` order.

## Which builds this works on

Up to 0.0.40 the server is a JavaScript bundle (`dist/bin.mjs`) and the
patcher rewrites it. From 0.0.41 the package ships a native executable per
platform (`@t3code/t3-<platform>-<arch>/t3`, a Node single-executable) with
the same readable bundle embedded. Its module table stores byte offsets, so
that build is patched in place with every edit kept to the same byte length:
the early filter swaps `!== "assistant_text"` for `=== "command_output"`
(only command output still returns early; the added branch is the only code
that acts on a non-assistant delta), and the reasoning branch is written over
the indentation stripped from the code that follows the assistant block. The
runner picks the target automatically. A build where an anchor moved is
discarded and the active version stays.

## Install

```sh
chmod +x t3-thinking
./t3-thinking install            # t3@nightly, patched
./t3-thinking install --tag latest
```

The package is installed under `~/.t3-thinking/<resolved-version>/`.

## Serve

```sh
./t3-thinking serve --port 3777
```

This replaces `npx t3@nightly serve --port 3777`. The newest installed version is used. To host it on localhost, run that command and connect the T3 client to the server's local address and port.

## Update and rollback

```sh
./t3-thinking update             # newest t3@nightly
./t3-thinking update --tag latest
./t3-thinking rollback
```

`update` installs and patches a build before moving it into the version store; a build the patcher cannot handle is discarded and the active version stays. Older versions remain in place. `rollback` selects the previous installed version for subsequent `serve` commands.

## How the patch is split

`preload.cjs` holds the logic: buffering reasoning deltas per turn and
appending `reasoning.text` activities. It is loaded into the server with
`NODE_OPTIONS=--require=<path>/preload.cjs` (`t3-thinking serve` sets it; the
service hook installs a drop-in for `t3code.service`). The patched server only
gains a one-line hook after its assistant-text handling that calls
`globalThis.__t3Thinking(...)` when the preload is present, so the logic can
be changed and the server restarted without patching again. Set
`T3_THINKING_DEBUG=1` to log the first delta of each turn and every flush to
the server's stderr.

## Patch anchors and wire shape

The patcher requires exactly one match for each of these anchors (variable names may differ between builds; the string literals may not):

- Early content filter: `<event>.type === "content.delta" && <event>.payload.streamKind !== "assistant_text") return;` (with or without braces)
- Assistant delta declaration: `const <delta> = <event>.type === "content.delta" && <event>.payload.streamKind === "assistant_text" ? <event>.payload.delta : void 0;`
- The `if (<delta> && ...) { ... }` statement that follows it, containing an `orchestrationEngine.dispatch({ type: "thread.message.assistant.delta", ... })` and a `const turnId = <helper>(event.turnId)`; the reasoning branch is inserted after that whole statement and reuses the helper.
- At least one `orchestrationEngine.dispatch({ type: "thread.activity.append", ... })` anywhere, proving the command exists.

The emitted activity is:

```js
{
  kind: "reasoning.text",
  tone: "info",
  summary: bufferedTextChunk.trim(),   // the contract requires a trimmed, non-empty summary
  payload: { itemId, streamKind, seq, text: bufferedTextChunk },  // exact chunk, spacing kept
  turnId
}
```

`seq` starts at zero for each `(threadId, itemId)` and increments after every flush. Flushes happen at 400 characters, on the next reasoning event after 500 ms, and when an item or turn completes. Each edit carries a revisioned `/* t3-thinking vN */` marker; a second patch run is a no-op and an older revision makes `--check` exit 3 so the hook re-patches from the pristine build. For a bundle the patcher checks syntax before its atomic rename and verifies two markers; for an executable it verifies one marker, an unchanged byte length, and that the few lines it re-indents contain no template literal.

To verify a real turn, start the server with `./t3-thinking serve --port 3777`, open a project in the T3 client, select a Claude Code model, enable thinking, and send a prompt. Inspect the server websocket or the browser Network tab. During the turn, the stream should contain `thread.activity.append` events whose activity has `kind: "reasoning.text"`, `tone: "info"`, and the payload above. The tone stays one every released client already decodes; a new tone would fail the whole thread stream decode in the web app and on phones. Concatenate `payload.text` (falling back to `summary`) by `payload.itemId` and ascending `payload.seq`. Claude Code's thinking deltas carry no item id; those chunks are keyed `turn:<turnId>`.

The runner needs only Bash, Node.js, and npm, on macOS or Linux.

## Keeping a service-launcher install patched

When T3 runs as the `t3code.service` user unit, its launcher keeps versions
under `~/.t3/runtime/versions/<version>/t3`, updates itself to new nightlies
and switches `~/.t3/runtime/service-state.json` to the new version. Install
the hook once:

```sh
./service-hook/install.sh
systemctl --user start t3-thinking-patch.service   # patch and restart now
```

The path unit runs `service-hook/patch-active-version.sh` whenever the state
file changes. The script patches the active version's executable (a no-op if
it already carries the marker), and if the running `t3 serve` child still
executes an unpatched copy it sends it SIGTERM; the launcher exits on an
unexpected child exit and systemd restarts the unit five seconds later with
the patched binary. While the launcher is trialling a new version the script
only patches the file and waits, because a child exit during a trial means
rollback.

## What you will actually see

Claude returns most thinking blocks empty: on this server's transcript only
7% of 1,120 blocks carried any text, and those were short summaries of longer
reasoning stretches. That is the model, not the pipeline: the same summaries
are what Claude's own desktop app shows. Expect one grey block on some turns,
none on most.
