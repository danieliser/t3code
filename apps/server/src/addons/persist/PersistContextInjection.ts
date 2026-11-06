import {
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  type PersistContextReceipt,
  type ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Digest from "effect/crypto/Digest";
import * as Hex from "effect/encoding/Hex";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import { requireEnvironmentScope } from "../../auth/http.ts";
import { ThreadManagementService } from "../../orchestration-v2/ThreadManagementService.ts";
import { ProviderSessionManagerV2 } from "../../orchestration-v2/ProviderSessionManager.ts";

export class PersistContextInjectionError extends Schema.TaggedError<PersistContextInjectionError>()(
  "PersistContextInjectionError",
  {
    reason: Schema.Literals([
      "target_unavailable",
      "payload_conflict",
      "delivery_unconfirmed",
      "receipt_not_found",
      "store_failed",
    ]),
    cause: Schema.optional(Schema.Defect()),
  },
) {}

interface ReceiptRow {
  injection_id: string;
  payload_hash: string;
  provider_session_id: string;
  stage: PersistContextReceipt["stage"];
  accepted_at: string;
  adopted_at: string | null;
}

const encodePayload = Schema.encodeEffect(
  Schema.fromJsonString(Schema.Tuple([Schema.String, Schema.String])),
);

const toReceipt = (row: ReceiptRow): PersistContextReceipt => ({
  injectionId: row.injection_id,
  providerSessionId: row.provider_session_id,
  stage: row.stage,
  acceptedAt: row.accepted_at,
  adoptedAt: row.adopted_at,
  injected: row.stage === "provider-adopted",
  modelConsumption: "unproven",
});

const resolveTarget = Effect.fn("persist.resolveContextTarget")(function* (threadId: ThreadId) {
  const threads = yield* ThreadManagementService;
  const sessions = yield* Effect.serviceOption(ProviderSessionManagerV2);
  const projection = yield* threads
    .getThreadRecords(threadId, ["providerThreads"])
    .pipe(
      Effect.mapError(
        (cause) => new PersistContextInjectionError({ reason: "target_unavailable", cause }),
      ),
    );
  const providerThread = projection.providerThreads.find(
    (thread) => thread.id === projection.thread.activeProviderThreadId,
  );
  const runtime =
    providerThread?.providerSessionId == null || Option.isNone(sessions)
      ? Option.none()
      : yield* sessions.value
          .get(providerThread.providerSessionId)
          .pipe(
            Effect.mapError(
              (cause) => new PersistContextInjectionError({ reason: "target_unavailable", cause }),
            ),
          );
  const active =
    projection.thread.archivedAt === null &&
    projection.thread.deletedAt === null &&
    projection.thread.settledAt === null;
  return {
    providerThread,
    inject: active && Option.isSome(runtime) ? runtime.value.injectContext : undefined,
  };
});

export const getPersistContextCapabilities = Effect.fn("persist.contextCapabilities")(function* (
  threadId: ThreadId,
) {
  yield* requireEnvironmentScope(AuthOrchestrationReadScope);
  const target = yield* resolveTarget(threadId);
  return {
    supported: target.inject !== undefined,
    providerSessionId: target.providerThread?.providerSessionId ?? null,
    startsTurn: false as const,
    timing: "next-model-request" as const,
    modelConsumption: "unproven" as const,
  };
});

const readRow = Effect.fn("persist.readContextReceiptRow")(function* (
  threadId: ThreadId,
  injectionId: string,
) {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql<ReceiptRow>`SELECT * FROM persist_context_injections WHERE thread_id = ${threadId} AND injection_id = ${injectionId}`.pipe(
    Effect.map((rows) => rows[0]),
    Effect.mapError((cause) => new PersistContextInjectionError({ reason: "store_failed", cause })),
  );
});

export const readPersistContextReceipt = Effect.fn("persist.readContextReceipt")(function* (
  threadId: ThreadId,
  injectionId: string,
) {
  yield* requireEnvironmentScope(AuthOrchestrationReadScope);
  const row = yield* readRow(threadId, injectionId);
  if (row === undefined)
    return yield* new PersistContextInjectionError({ reason: "receipt_not_found" });
  return toReceipt(row);
});

export const injectPersistContext = Effect.fn("persist.injectContext")(function* (input: {
  readonly threadId: ThreadId;
  readonly injectionId: string;
  readonly targetAgentId: string;
  readonly text: string;
}) {
  yield* requireEnvironmentScope(AuthOrchestrationOperateScope);
  const sql = yield* SqlClient.SqlClient;
  const digest = yield* Digest.Digest;
  const canonical = yield* encodePayload([input.targetAgentId, input.text]).pipe(
    Effect.mapError((cause) => new PersistContextInjectionError({ reason: "store_failed", cause })),
  );
  const hash = Hex.encode(
    yield* digest
      .digest(Digest.sha256, new TextEncoder().encode(canonical))
      .pipe(
        Effect.mapError(
          (cause) => new PersistContextInjectionError({ reason: "store_failed", cause }),
        ),
      ),
  );
  const confirm = (row: ReceiptRow) => {
    if (row.payload_hash !== hash)
      return Effect.fail(new PersistContextInjectionError({ reason: "payload_conflict" }));
    if (row.stage !== "provider-adopted")
      return Effect.fail(new PersistContextInjectionError({ reason: "delivery_unconfirmed" }));
    return Effect.succeed(toReceipt(row));
  };
  const previous = yield* readRow(input.threadId, input.injectionId);
  if (previous !== undefined) return yield* confirm(previous);
  const target = yield* resolveTarget(input.threadId);
  if (target.inject === undefined || target.providerThread?.providerSessionId == null) {
    return yield* new PersistContextInjectionError({ reason: "target_unavailable" });
  }
  const acceptedAt = DateTime.formatIso(yield* DateTime.now);
  const rows = yield* sql<ReceiptRow>`
    INSERT INTO persist_context_injections (thread_id, injection_id, payload_hash, provider_session_id, stage, accepted_at)
    VALUES (${input.threadId}, ${input.injectionId}, ${hash}, ${target.providerThread.providerSessionId}, 'accepted', ${acceptedAt})
    ON CONFLICT (thread_id, injection_id) DO NOTHING RETURNING *
  `.pipe(
    Effect.mapError((cause) => new PersistContextInjectionError({ reason: "store_failed", cause })),
  );
  if (rows.length === 0) {
    const existing = yield* readRow(input.threadId, input.injectionId);
    if (existing === undefined)
      return yield* new PersistContextInjectionError({ reason: "store_failed" });
    return yield* confirm(existing);
  }
  // The native RPC has no idempotency key: a committed intent is never sent again after an uncertain outcome.
  const result = yield* target
    .inject({ providerThread: target.providerThread, text: input.text })
    .pipe(Effect.result);
  const adoptedAt = result._tag === "Success" ? DateTime.formatIso(yield* DateTime.now) : null;
  yield* sql`
    UPDATE persist_context_injections SET stage = ${result._tag === "Success" ? "provider-adopted" : "indeterminate"}, adopted_at = ${adoptedAt}
    WHERE thread_id = ${input.threadId} AND injection_id = ${input.injectionId}
  `.pipe(
    Effect.mapError((cause) => new PersistContextInjectionError({ reason: "store_failed", cause })),
  );
  if (result._tag === "Failure")
    return yield* new PersistContextInjectionError({
      reason: "delivery_unconfirmed",
      cause: result.failure,
    });
  return { ...toReceipt(rows[0]!), stage: "provider-adopted" as const, adoptedAt, injected: true };
});
