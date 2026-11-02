import type { PersistFleetSnapshot, ThreadId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";
export class PersistRouteQueryError extends Schema.TaggedError<PersistRouteQueryError>()(
  "PersistRouteQueryError",
  { cause: Schema.Defect() },
) {}
import type { ThreadManagementServiceShape } from "../../orchestration-v2/ThreadManagementService.ts";
import type { PersistRouteThread } from "./PersistThreadRoutes.ts";

export interface PersistRouteQuery {
  readonly getShellSnapshot: () => Effect.Effect<
    { readonly threads: ReadonlyArray<{ readonly id: ThreadId; readonly updatedAt: string }> },
    PersistRouteQueryError
  >;
  readonly getThreadDetailById: (
    threadId: ThreadId,
    options?: { readonly activityKinds: ReadonlyArray<string> },
  ) => Effect.Effect<Option.Option<PersistRouteThread>, PersistRouteQueryError>;
}

export function makePersistV2RouteQuery(
  query: Pick<ThreadManagementServiceShape, "getShellSnapshot" | "getThreadRecords">,
): PersistRouteQuery {
  return {
    getShellSnapshot: () =>
      query.getShellSnapshot().pipe(
        Effect.map((shell) => ({
          threads: shell.threads.map((thread) => ({
            id: thread.id,
            updatedAt: DateTime.formatIso(thread.updatedAt),
          })),
        })),
        Effect.mapError((cause) => new PersistRouteQueryError({ cause })),
      ),
    getThreadDetailById: (threadId) =>
      query.getThreadRecords(threadId, ["messages", "turnItems"]).pipe(
        Effect.map((projection) =>
          Option.some({
            id: threadId,
            messages: projection.messages.map((message) => ({
              role: message.role,
              text: message.text,
              createdAt: DateTime.formatIso(message.createdAt),
            })),
            activities: projection.turnItems.flatMap((item) =>
              item.type !== "dynamic_tool" || item.status !== "completed"
                ? []
                : [
                    {
                      kind: "tool.completed",
                      createdAt: DateTime.formatIso(item.completedAt ?? item.updatedAt),
                      payload: {
                        itemType: "mcpToolCall",
                        data: { toolName: item.toolName, input: item.input },
                      },
                    },
                  ],
            ),
          }),
        ),
        Effect.mapError((cause) => new PersistRouteQueryError({ cause })),
      ),
  };
}
import { attachPersistThreadRoutes, readPersistFleet } from "./PersistFleetClient.ts";
import {
  discoverPersistThreadRouteRecords,
  type PersistThreadRouteRecord,
} from "./PersistThreadRoutes.ts";

/**
 * Builds a connection-local fleet reader. Route identity is reconstructed from
 * T3 activity on first use and incrementally refreshed from changed threads;
 * it is never written as a durable route cache.
 */
type PersistFleetReader<E, R> = (input: {
  readonly includeOffline?: boolean | undefined;
}) => Effect.Effect<PersistFleetSnapshot, E, R>;

export function makePersistFleetSnapshotReader(
  query: PersistRouteQuery,
): (input: {
  readonly includeOffline?: boolean | undefined;
}) => ReturnType<typeof readPersistFleet>;
export function makePersistFleetSnapshotReader<E, R>(
  query: PersistRouteQuery,
  options: { readonly readFleet: PersistFleetReader<E, R> },
): PersistFleetReader<E, R>;
export function makePersistFleetSnapshotReader<E, R>(
  query: PersistRouteQuery,
  options?: { readonly readFleet: PersistFleetReader<E, R> },
) {
  let initialized = false;
  const threadVersions = new Map<ThreadId, string>();
  const routes = new Map<string, PersistThreadRouteRecord>();
  const discoveredAgentIds = new Set<string>();
  const readFleet: PersistFleetReader<E, R> | typeof readPersistFleet =
    options?.readFleet ?? readPersistFleet;

  return (input: { readonly includeOffline?: boolean | undefined }) =>
    Effect.gen(function* () {
      const snapshot = yield* readFleet(input);
      const knownAgentIds = new Set(snapshot.agents.map((agent) => agent.agentId));
      const hasNewAgentIds = [...knownAgentIds].some((agentId) => !discoveredAgentIds.has(agentId));

      return yield* Effect.gen(function* () {
        const shell = yield* query.getShellSnapshot();
        const liveThreadIds = new Set(shell.threads.map((thread) => thread.id));
        const changedThreads = shell.threads.filter(
          (thread) =>
            !initialized || hasNewAgentIds || threadVersions.get(thread.id) !== thread.updatedAt,
        );

        const detailResults = yield* Effect.forEach(
          changedThreads,
          (thread) =>
            query
              .getThreadDetailById(thread.id, {
                activityKinds: ["item.completed", "tool.completed"],
              })
              .pipe(
                Effect.map((detail) => ({
                  thread,
                  detail: Option.getOrNull(detail),
                  failed: false as const,
                })),
                Effect.catchCause((cause) =>
                  Effect.logWarning("PERSIST route refresh skipped one thread", {
                    threadId: thread.id,
                    cause: Cause.pretty(cause),
                  }).pipe(
                    Effect.as({
                      thread,
                      detail: null,
                      failed: true as const,
                    }),
                  ),
                ),
              ),
          { concurrency: 8 },
        );
        const details = detailResults.flatMap((result) => {
          if (result.failed) return [];
          threadVersions.set(result.thread.id, result.thread.updatedAt);
          return result.detail === null ? [] : [result.detail];
        });
        for (const [agentId, route] of discoverPersistThreadRouteRecords(details, knownAgentIds)) {
          const current = routes.get(agentId);
          if (current === undefined || route.discoveredAt >= current.discoveredAt) {
            routes.set(agentId, route);
          }
        }

        initialized = true;
        for (const agentId of knownAgentIds) {
          discoveredAgentIds.add(agentId);
        }
        for (const [agentId, route] of routes) {
          if (!liveThreadIds.has(route.threadId)) {
            routes.delete(agentId);
          }
        }

        return attachPersistThreadRoutes(
          snapshot,
          new Map([...routes].map(([agentId, route]) => [agentId, route.threadId])),
        );
      }).pipe(
        // Fleet status remains useful even if T3's route projection is briefly
        // unavailable. Unknown routes render as unknown rather than guessed.
        Effect.catchCause((cause) =>
          Effect.logWarning("PERSIST route projection unavailable", {
            cause: Cause.pretty(cause),
          }).pipe(Effect.as(snapshot)),
        ),
      );
    });
}
