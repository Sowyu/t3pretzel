import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as HttpClient from "effect/http/HttpClient";
import * as TestClock from "effect/testing/TestClock";

import { BearerConnectionProfile, type ConnectionCatalogEntry } from "./catalog.ts";
import * as ConnectionDriver from "./driver.ts";
import { BearerConnectionTarget } from "./model.ts";
import * as ConnectionResolver from "./resolver.ts";
import * as RpcSession from "../rpc/session.ts";

const ENVIRONMENT_ID = EnvironmentId.make("environment-1");

function bearerEntry(httpBaseUrl: string): ConnectionCatalogEntry {
  const target = new BearerConnectionTarget({
    environmentId: ENVIRONMENT_ID,
    label: "Saved",
    connectionId: `bearer:${httpBaseUrl}`,
  });
  const profile = new BearerConnectionProfile({
    connectionId: target.connectionId,
    environmentId: ENVIRONMENT_ID,
    label: "Saved",
    httpBaseUrl,
    wsBaseUrl: httpBaseUrl.replace("http", "ws"),
  });
  return { target, profile: Option.some(profile), enabled: true };
}

// Every request hangs, like a saved address on a network that drops its packets.
const silentNetwork = Layer.mergeAll(
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make(() => Effect.never),
  ),
  Layer.succeed(
    ConnectionResolver.ConnectionResolver,
    ConnectionResolver.ConnectionResolver.of({
      prepare: () => Effect.die("unused"),
      prepareForUpdate: () => Effect.die("unused"),
    }),
  ),
  Layer.succeed(
    RpcSession.RpcSessionFactory,
    RpcSession.RpcSessionFactory.of({ connect: () => Effect.die("unused") }),
  ),
);

describe("ConnectionDriver.checkRoute", () => {
  it.effect("gives up on a silent LAN address sooner than on a tailnet one", () =>
    Effect.gen(function* () {
      const driver = yield* ConnectionDriver.make.pipe(Effect.provide(silentNetwork));
      const check = (httpBaseUrl: string) => {
        const entry = bearerEntry(httpBaseUrl);
        return driver
          .checkRoute(entry, { target: entry.target, profile: entry.profile })
          .pipe(Effect.forkChild);
      };
      const lan = yield* check("http://192.168.1.10:3773");
      const tailnet = yield* check("http://laptop.tail1234.ts.net:3773");

      yield* TestClock.adjust("1 second");
      expect(yield* Fiber.join(lan)).toBe("silent");
      expect(tailnet.pollUnsafe()).toBeUndefined();

      yield* TestClock.adjust("1500 millis");
      expect(yield* Fiber.join(tailnet)).toBe("silent");
    }),
  );
});
