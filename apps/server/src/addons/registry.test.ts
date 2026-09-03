import { it as effectIt } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import { FetchHttpClient } from "effect/unstable/http";
import { describe, expect } from "vite-plus/test";

import { executeServerAddonAction } from "./registry.ts";

const AddonServices = Layer.merge(FetchHttpClient.layer, FileSystem.layerNoop({}));

describe("server addon action registry", () => {
  effectIt.effect("rejects unknown actions with a typed addon error", () =>
    Effect.gen(function* () {
      const error = yield* executeServerAddonAction({
        addonId: "missing",
        actionId: "unknown",
        payload: {},
      }).pipe(Effect.flip, Effect.provide(AddonServices));
      expect(error).toMatchObject({
        _tag: "ServerAddonActionError",
        addonId: "missing",
        actionId: "unknown",
      });
    }),
  );

  effectIt.effect("rejects malformed addon-owned payloads before execution", () =>
    Effect.gen(function* () {
      const error = yield* executeServerAddonAction({
        addonId: "persist",
        actionId: "fleet.agent.upsert",
        payload: { agentId: "incomplete" },
      }).pipe(Effect.flip, Effect.provide(AddonServices));
      expect(error.message).toBe("Invalid PERSIST fleet registration payload.");
    }),
  );
});
