import { it as effectIt } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { describe, expect } from "vite-plus/test";

import { executeServerAddonAction } from "./registry.ts";

describe("server addon action registry", () => {
  effectIt.effect("rejects unknown actions with a typed addon error", () =>
    Effect.gen(function* () {
      const error = yield* executeServerAddonAction({
        addonId: "missing",
        actionId: "unknown",
        payload: {},
      }).pipe(Effect.flip);
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
      }).pipe(Effect.flip);
      expect(error.message).toBe("Invalid PERSIST fleet registration payload.");
    }),
  );
});
