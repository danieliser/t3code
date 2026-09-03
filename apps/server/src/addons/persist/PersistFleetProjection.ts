import type { ThreadId } from "@t3tools/contracts";
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
export function makePersistFleetSnapshotReader(query: ProjectionSnapshotQueryShape) {
  let initialized = false;
  const threadVersions = new Map<ThreadId, string>();
  const routes = new Map<string, PersistThreadRouteRecord>();

  return (input: { readonly includeOffline?: boolean | undefined }) =>
    Effect.gen(function* () {
      const snapshot = yield* readPersistFleet(input);
      const knownAgentIds = new Set(snapshot.agents.map((agent) => agent.agentId));

      return yield* Effect.gen(function* () {
        const shell = yield* query.getShellSnapshot();
        const liveThreadIds = new Set(shell.threads.map((thread) => thread.id));
        const changedThreads = shell.threads.filter((thread) => {
          const changed = !initialized || threadVersions.get(thread.id) !== thread.updatedAt;
          threadVersions.set(thread.id, thread.updatedAt);
          return changed;
        });

        const details = yield* Effect.forEach(
          changedThreads,
          (thread) => query.getThreadDetailById(thread.id).pipe(Effect.map(Option.getOrNull)),
          { concurrency: 8 },
        );
        for (const [agentId, route] of discoverPersistThreadRouteRecords(
          details.filter((thread) => thread !== null),
          knownAgentIds,
        )) {
          const current = routes.get(agentId);
          if (current === undefined || route.discoveredAt >= current.discoveredAt) {
            routes.set(agentId, route);
          }
        }

        initialized = true;
        for (const [agentId, route] of routes) {
          if (!knownAgentIds.has(agentId) || !liveThreadIds.has(route.threadId)) {
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
        Effect.orElseSucceed(() => snapshot),
      );
    });
}
