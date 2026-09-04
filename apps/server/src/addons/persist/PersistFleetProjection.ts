import type { PersistFleetSnapshot, ThreadId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { ProjectionSnapshotQueryShape } from "../../orchestration/Services/ProjectionSnapshotQuery.ts";
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
  query: ProjectionSnapshotQueryShape,
): (input: {
  readonly includeOffline?: boolean | undefined;
}) => ReturnType<typeof readPersistFleet>;
export function makePersistFleetSnapshotReader<E, R>(
  query: ProjectionSnapshotQueryShape,
  options: { readonly readFleet: PersistFleetReader<E, R> },
): PersistFleetReader<E, R>;
export function makePersistFleetSnapshotReader<E, R>(
  query: ProjectionSnapshotQueryShape,
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
