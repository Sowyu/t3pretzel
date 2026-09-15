import { describe, expect, it } from "vitest";

import { patchMainActivity } from "./withAndroidTabletOrientation.cjs";

const expoMainActivity = `package com.t3tools.t3code
import android.os.Bundle
import com.facebook.react.ReactActivity

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
  }
}
`;

const legacyMainActivity = `package com.t3tools.t3code
import android.os.Bundle
import android.content.pm.ActivityInfo
import android.content.res.Configuration
import com.facebook.react.ReactActivity

class MainActivity : ReactActivity() {
  // Applied in onCreate and re-applied on fold/unfold; added by
  // withAndroidTabletOrientation.
  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    applyTabletOrientation()
  }

  private fun applyTabletOrientation() {
    requestedOrientation = if (resources.configuration.smallestScreenWidthDp >= 600) {
      ActivityInfo.SCREEN_ORIENTATION_FULL_USER
    } else {
      ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
    }
  }
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
    applyTabletOrientation()
  }
}
`;

describe("Android windowing MainActivity patch", () => {
  it("unlocks desk-mode windows and rebinds display metrics from the activity", () => {
    const patched = patchMainActivity(expoMainActivity);
    expect(patched).toContain("Configuration.UI_MODE_TYPE_DESK");
    expect(patched).toContain("smallestScreenWidthDp >= 600");
    expect(patched).toContain("DisplayMetricsHolder.initDisplayMetrics(this)");
    expect(patched).toContain(
      "super.onConfigurationChanged(newConfig)\n    applyWindowedOrientation()\n    rebindWindowDisplayMetrics()",
    );
    expect(patched).toContain(
      "super.onCreate(null)\n    applyWindowedOrientation()\n    rebindWindowDisplayMetrics()",
    );
  });

  it("replaces the tablet-only injection on an existing MainActivity", () => {
    const patched = patchMainActivity(legacyMainActivity);
    expect(patched).not.toContain("applyTabletOrientation");
    expect(patched).toContain("DisplayMetricsHolder.initDisplayMetrics(this)");
    expect(patched).toContain("import com.facebook.react.uimanager.DisplayMetricsHolder");
  });

  it("is idempotent", () => {
    const once = patchMainActivity(expoMainActivity);
    expect(patchMainActivity(once)).toBe(once);
  });
});
