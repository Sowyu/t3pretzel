import { describe, expect, it } from "vite-plus/test";

import { describePairingFailure } from "./pairingFailure";

describe("describePairingFailure", () => {
  it("names the host when the request never reached it", () => {
    const error = { _tag: "ConnectionTransientError", reason: "network", detail: "raw" };
    expect(describePairingFailure(error, "http://192.168.1.100:3773/#token=abc")).toBe(
      "Couldn't reach 192.168.1.100:3773. Check the address and that the server is running.",
    );
  });

  it("leaves other failures to their own message", () => {
    const error = { _tag: "ConnectionBlockedError", reason: "authentication" };
    expect(describePairingFailure(error, "http://192.168.1.100:3773")).toBeNull();
  });
});
