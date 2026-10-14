import { describe, expect, it } from "vitest";

import { patchMainActivity } from "./withAndroidLatestLinkIntent.cjs";

const expoMainActivity = `package com.t3tools.t3code
import android.os.Bundle
import com.facebook.react.ReactActivity

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
  }
}
`;

describe("Android latest link intent MainActivity patch", () => {
  it("keeps the newest intent so getInitialURL sees a link that arrived during startup", () => {
    const patched = patchMainActivity(expoMainActivity);
    expect(patched).toContain("import android.content.Intent\nimport android.os.Bundle");
    expect(patched).toContain(
      "override fun onNewIntent(intent: Intent) {\n    super.onNewIntent(intent)\n    setIntent(intent)\n  }",
    );
  });

  it("is idempotent", () => {
    const once = patchMainActivity(expoMainActivity);
    expect(patchMainActivity(once)).toBe(once);
  });

  it("refuses to add a second onNewIntent", () => {
    const existing = expoMainActivity.replace(
      "class MainActivity : ReactActivity() {",
      "class MainActivity : ReactActivity() {\n  override fun onNewIntent(intent: Intent) {}",
    );
    expect(() => patchMainActivity(existing)).toThrow(/already overrides onNewIntent/);
  });
});
