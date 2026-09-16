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
  tone: "thinking",
  summary: bufferedTextChunk,
  payload: { itemId, streamKind, seq },
  turnId
}
```

`seq` starts at zero for each `(threadId, itemId)` and increments after every flush. Flushes happen at 400 characters, on the next reasoning event after 500 ms, and when an item or turn completes. Each edit carries `/* t3-thinking */`; a second patch run is a no-op. For a bundle the patcher checks syntax before its atomic rename and verifies three markers; for an executable it verifies one marker and an unchanged byte length.

To verify a real turn, start the server with `./t3-thinking serve --port 3777`, open a project in the T3 client, select a Claude Code model, enable thinking, and send a prompt. Inspect the server websocket or the browser Network tab. During the turn, the stream should contain `thread.activity.append` events whose activity has `kind: "reasoning.text"`, `tone: "thinking"`, and the payload above. Concatenate `summary` values by `payload.itemId` and ascending `payload.seq`.

The runner needs only Bash, Node.js, and npm, on macOS or Linux.
