import { describe, expect, it, vi } from "vite-plus/test";

import { alertRequestFromNative, orderAlertButtons } from "./android-alert";

describe("Android alert", () => {
  it("defaults to a single OK button and runs done before the button callback", () => {
    const calls: string[] = [];
    const request = alertRequestFromNative("Title", null, undefined, undefined, () =>
      calls.push("done"),
    );
    expect(request.buttons.map((button) => button.text)).toEqual(["OK"]);
    expect(request.message).toBeUndefined();

    const withButton = alertRequestFromNative(
      "Title",
      "Body",
      [{ text: "Delete", style: "destructive", onPress: () => calls.push("delete") }],
      undefined,
      () => calls.push("done"),
    );
    withButton.buttons[0]!.onPress();
    expect(calls).toEqual(["done", "delete"]);
  });

  it("orders buttons like UIAlertController", () => {
    const button = (text: string, style: "default" | "cancel" | "destructive") => ({
      text,
      style,
      onPress: vi.fn(),
    });
    const two = orderAlertButtons([button("Delete", "destructive"), button("Cancel", "cancel")]);
    expect(two.horizontal).toBe(true);
    expect(two.ordered.map((entry) => entry.text)).toEqual(["Cancel", "Delete"]);

    const three = orderAlertButtons([
      button("Cancel", "cancel"),
      button("Archive", "default"),
      button("Delete", "destructive"),
    ]);
    expect(three.horizontal).toBe(false);
    expect(three.ordered.map((entry) => entry.text)).toEqual(["Archive", "Delete", "Cancel"]);

    const long = orderAlertButtons([
      button("Keep editing", "cancel"),
      button("Discard changes", "destructive"),
    ]);
    expect(long.horizontal).toBe(false);
    expect(long.ordered.map((entry) => entry.text)).toEqual(["Discard changes", "Keep editing"]);
  });
});
