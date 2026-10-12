import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import withAndroidNetworkSecurityConfig from "./withAndroidNetworkSecurityConfig.cjs";

const tempDirectories = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => NodeFSP.rm(directory, { recursive: true })),
  );
});

describe("Android network security config", () => {
  it("points the manifest at the config and drops the cleartext attribute it replaces", async () => {
    const config = withAndroidNetworkSecurityConfig({ name: "Test", slug: "test" });
    const result = await config.mods.android.manifest({
      ...config,
      modRequest: { platform: "android", modName: "manifest", introspect: false },
      modResults: {
        manifest: { application: [{ $: { "android:usesCleartextTraffic": "true" } }] },
      },
    });
    const application = result.modResults.manifest.application[0];
    expect(application.$["android:networkSecurityConfig"]).toBe("@xml/network_security_config");
    expect(application.$["android:usesCleartextTraffic"]).toBeUndefined();
  });

  it("writes a config that trusts user-installed CAs alongside system ones", async () => {
    const projectRoot = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-nsc-"));
    tempDirectories.push(projectRoot);
    const config = withAndroidNetworkSecurityConfig({ name: "Test", slug: "test" });
    await config.mods.android.dangerous({
      ...config,
      modRequest: {
        platform: "android",
        modName: "dangerous",
        introspect: false,
        platformProjectRoot: projectRoot,
      },
      modResults: {},
    });
    const xml = await NodeFSP.readFile(
      NodePath.join(projectRoot, "app", "src", "main", "res", "xml", "network_security_config.xml"),
      "utf8",
    );
    expect(xml).toContain('<certificates src="system" />');
    expect(xml).toContain('<certificates src="user" />');
    expect(xml).toContain('cleartextTrafficPermitted="true"');
  });
});
