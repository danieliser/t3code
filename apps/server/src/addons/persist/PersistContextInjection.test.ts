import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as SqlitePersistence from "../../persistence/Sqlite.ts";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import type { OrchestrationV2ThreadProjection } from "@t3tools/contracts";
import * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";
import { assert, it } from "@effect/vitest";
import {
  AuthOrchestrationReadScope,
  AuthOrchestrationOperateScope,
  AuthSessionId,
  ProviderDriverKind,
  EnvironmentAuthenticatedPrincipal,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ThreadManagementService } from "../../orchestration-v2/ThreadManagementService.ts";
import { ProviderSessionManagerV2 } from "../../orchestration-v2/ProviderSessionManager.ts";
import {
  injectPersistContext,
  readPersistContextReceipt,
  getPersistContextCapabilities,
} from "./PersistContextInjection.ts";

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
      ).pipe(
        Layer.provideMerge(SqlitePersistence.layerMemory),
        Layer.provideMerge(NodeCrypto.layer),
        Layer.provideMerge(NodeServices.layer),
      ),
    ),
  ),
);

it.effect.each(["acknowledged", "uncertain"] as const)(
  "keeps %s native injection durable without replaying a pending or ambiguous effect",
  (outcome) =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      let calls = 0;
      const threadId = ThreadId.make("context-thread");
      const projection = {
        thread: {
          id: threadId,
          activeProviderThreadId: "context-provider-thread",
          archivedAt: null,
          deletedAt: null,
          settledAt: null,
        },
        providerThreads: [{ id: "context-provider-thread", providerSessionId: "context-session" }],
      } as unknown as OrchestrationV2ThreadProjection;
      const runtime = {
        injectContext: () =>
          Effect.gen(function* () {
            calls += 1;
            yield* Deferred.succeed(started, undefined);
            yield* Deferred.await(release);
            if (outcome === "uncertain")
              return yield* new ProviderAdapter.ProviderAdapterProtocolError({
                driver: ProviderDriverKind.make("codex"),
                detail: "Acknowledgement lost",
              });
          }),
      } as unknown as ProviderAdapter.ProviderAdapterV2SessionRuntime;
      const input = {
        threadId,
        injectionId: "context-once",
        targetAgentId: "fixture",
        text: "Mailbox context",
      };
      yield* Effect.gen(function* () {
        assert.isTrue((yield* getPersistContextCapabilities(threadId)).supported);
        const first = yield* injectPersistContext(input).pipe(Effect.result, Effect.forkChild);
        yield* Deferred.await(started);
        assert.equal(
          (yield* readPersistContextReceipt(threadId, input.injectionId)).stage,
          "accepted",
        );
        const pending = yield* injectPersistContext(input).pipe(Effect.flip);
        assert.propertyVal(pending, "reason", "delivery_unconfirmed");
        const conflict = yield* injectPersistContext({ ...input, text: "Changed context" }).pipe(
          Effect.flip,
        );
        assert.propertyVal(conflict, "reason", "payload_conflict");
        yield* Deferred.succeed(release, undefined);
        const completed = yield* Fiber.join(first);
        assert.equal(completed._tag, outcome === "acknowledged" ? "Success" : "Failure");
        const receipt = yield* readPersistContextReceipt(threadId, input.injectionId);
        assert.equal(
          receipt.stage,
          outcome === "acknowledged" ? "provider-adopted" : "indeterminate",
        );
        assert.equal(receipt.injected, outcome === "acknowledged");
        assert.equal(receipt.modelConsumption, "unproven");
        assert.notProperty(receipt, "text");
        const repeated = yield* injectPersistContext(input).pipe(Effect.result);
        assert.equal(repeated._tag, completed._tag);
        assert.equal(calls, 1);
        const otherThread = yield* readPersistContextReceipt(
          ThreadId.make("other-thread"),
          input.injectionId,
        ).pipe(Effect.flip);
        assert.propertyVal(otherThread, "reason", "receipt_not_found");
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.mock(ThreadManagementService)({
              getThreadRecords: () => Effect.succeed(projection),
            }),
            Layer.mock(ProviderSessionManagerV2)({ get: () => Effect.succeedSome(runtime) }),
            Layer.succeed(EnvironmentAuthenticatedPrincipal, {
              sessionId: AuthSessionId.make("context-session"),
              subject: "test",
              method: "bearer-access-token",
              scopes: new Set([AuthOrchestrationReadScope, AuthOrchestrationOperateScope]),
            }),
          ),
        ),
      );
    }).pipe(
      Effect.provide(
        Layer.mergeAll(SqlitePersistence.layerMemory, NodeCrypto.layer, NodeServices.layer),
      ),
    ),
);
