import { AuthOrchestrationOperateScope, type ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { requireEnvironmentScope } from "../../auth/http.ts";
import { ThreadManagementService } from "../../orchestration-v2/ThreadManagementService.ts";
import { ProviderSessionManagerV2 } from "../../orchestration-v2/ProviderSessionManager.ts";

export class PersistContextInjectionError extends Schema.TaggedError<PersistContextInjectionError>()(
  "PersistContextInjectionError",
  { detail: Schema.String, cause: Schema.optional(Schema.Defect()) },
) {}

export const injectPersistContext = Effect.fn("persist.injectContext")(function* (input: {
  readonly threadId: ThreadId;
  readonly injectionId: string;
  readonly targetAgentId: string;
  readonly text: string;
}) {
  yield* requireEnvironmentScope(AuthOrchestrationOperateScope);
  const threads = yield* ThreadManagementService;
  const sessions = yield* ProviderSessionManagerV2;
  const projection = yield* threads
    .getThreadRecords(input.threadId, ["providerThreads"])
    .pipe(
      Effect.mapError(
        (cause) =>
          new PersistContextInjectionError({ detail: "Cannot load the target thread", cause }),
      ),
    );
  const providerThread = projection.providerThreads.find(
    (thread) => thread.id === projection.thread.activeProviderThreadId,
  );
  if (providerThread?.providerSessionId == null)
    return yield* new PersistContextInjectionError({
      detail: "No live provider session is bound to the target thread",
    });
  const runtime = yield* sessions.get(providerThread.providerSessionId).pipe(
    Effect.mapError(
      (cause) =>
        new PersistContextInjectionError({
          detail: "Cannot load the target provider session",
          cause,
        }),
    ),
  );
  if (Option.isNone(runtime) || runtime.value.injectContext === undefined)
    return yield* new PersistContextInjectionError({
      detail: "Provider context injection is unavailable",
    });
  yield* runtime.value
    .injectContext({ providerThread, text: input.text })
    .pipe(
      Effect.mapError(
        (cause) =>
          new PersistContextInjectionError({ detail: "Provider context injection failed", cause }),
      ),
    );
  return { injectionId: input.injectionId, injected: true as const };
});
