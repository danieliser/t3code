import { assert, it } from "@effect/vitest";
import {
  AuthOrchestrationReadScope,
  AuthSessionId,
  EnvironmentAuthenticatedPrincipal,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ThreadManagementService } from "../../orchestration-v2/ThreadManagementService.ts";
import { ProviderSessionManagerV2 } from "../../orchestration-v2/ProviderSessionManager.ts";
import { injectPersistContext } from "./PersistContextInjection.ts";

it.effect("requires operate permission before reading or injecting PERSIST context", () =>
  Effect.gen(function* () {
    const result = yield* injectPersistContext({
      threadId: ThreadId.make("thread"),
      injectionId: "injection",
      targetAgentId: "agent",
      text: "Context",
    }).pipe(Effect.result);
    assert.equal(result._tag, "Failure");
    if (result._tag === "Failure")
      assert.equal(result.failure._tag, "EnvironmentScopeRequiredError");
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        Layer.succeed(EnvironmentAuthenticatedPrincipal, {
          sessionId: AuthSessionId.make("read-only"),
          subject: "test",
          method: "bearer-access-token",
          scopes: new Set([AuthOrchestrationReadScope]),
        }),
        Layer.mock(ThreadManagementService)({
          getThreadRecords: () => Effect.die("must not read an unauthorized thread"),
        }),
        Layer.mock(ProviderSessionManagerV2)({
          get: () => Effect.die("must not access an unauthorized provider"),
        }),
      ),
    ),
  ),
);
