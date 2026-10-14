import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createAppLinkQueue, readInitialAppLink } from "./appLinkQueue";

describe("createAppLinkQueue", () => {
  it("delivers links that arrive before navigation is ready, in order, once", () => {
    const queue = createAppLinkQueue();
    const delivered: string[] = [];
    queue.push("t3code://threads/env/one");
    queue.subscribe((url) => delivered.push(url));
    queue.push("t3code://threads/env/two");
    expect(delivered).toEqual([]);
    queue.markReady();
    expect(delivered).toEqual(["t3code://threads/env/one", "t3code://threads/env/two"]);
    queue.push("t3code://threads/env/three");
    expect(delivered).toEqual([
      "t3code://threads/env/one",
      "t3code://threads/env/two",
      "t3code://threads/env/three",
    ]);
  });

  it("keeps links for the next listener after one unsubscribes", () => {
    const queue = createAppLinkQueue();
    queue.markReady();
    const unsubscribe = queue.subscribe(() => {});
    unsubscribe();
    queue.push("t3code://threads/env/one");
    const delivered: string[] = [];
    queue.subscribe((url) => delivered.push(url));
    expect(delivered).toEqual(["t3code://threads/env/one"]);
  });
});

describe("readInitialAppLink", () => {
  afterEach(() => vi.useRealTimers());

  it("waits past React Navigation's 150 ms for a slow launch URL", async () => {
    vi.useFakeTimers();
    const url = readInitialAppLink(
      () => new Promise((resolve) => setTimeout(() => resolve("t3code://threads/env/one"), 1_000)),
    );
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(url).resolves.toBe("t3code://threads/env/one");
  });

  it("opens without a link when the native call never answers", async () => {
    vi.useFakeTimers();
    const url = readInitialAppLink(() => new Promise(() => {}), 3_000);
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(url).resolves.toBeNull();
  });
});
