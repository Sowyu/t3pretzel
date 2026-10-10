import { describe, expect, it } from "vite-plus/test";

import { getTerminalBufferReplayKey, getTerminalSurfaceReplayWindow } from "./terminalBufferReplay";

describe("terminalBufferReplay", () => {
  it("keys replay readiness by terminal identity and font metrics", () => {
    expect(
      getTerminalBufferReplayKey({
        terminalKey: "env-1:thread-1:default",
        fontSize: 10,
      }),
    ).toBe("env-1:thread-1:default:10");
  });

  it("shows terminal history while replay key is unset (initial mount / after key change)", () => {
    const replayKey = getTerminalBufferReplayKey({
      terminalKey: "env-1:thread-1:default",
      fontSize: 10,
    });

    expect(
      getTerminalSurfaceReplayWindow({
        buffer: "fastfetch output",
        startOffset: 40,
        resetKey: "0:1",
        replayKey,
        readyReplayKey: null,
      }),
    ).toEqual({ buffer: "fastfetch output", startOffset: 40, resetKey: "0:1" });
    expect(
      getTerminalSurfaceReplayWindow({
        buffer: "fastfetch output",
        startOffset: 40,
        resetKey: "0:1",
        replayKey,
        readyReplayKey: "env-1:thread-1:default:11",
      }),
    ).toEqual({ buffer: "", startOffset: 0, resetKey: `stale:${replayKey}` });
    expect(
      getTerminalSurfaceReplayWindow({
        buffer: "fastfetch output",
        startOffset: 40,
        resetKey: "0:1",
        replayKey,
        readyReplayKey: replayKey,
      }),
    ).toEqual({ buffer: "fastfetch output", startOffset: 40, resetKey: "0:1" });
  });
});
