import {
  ThreadId,
  type OrchestrationShellSnapshot,
  type OrchestrationThread,
  type PersistFleetSnapshot,
} from "@t3tools/contracts";
import { it as effectIt } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect } from "vite-plus/test";

import type {
  ProjectionSnapshotQueryShape,
  ProjectionThreadDetailQuery,
} from "../../orchestration/Services/ProjectionSnapshotQuery.ts";
import { makePersistFleetSnapshotReader } from "./PersistFleetProjection.ts";

const generatedAt = "2026-09-04T07:00:00.000Z" as PersistFleetSnapshot["generatedAt"];

function fleetAgent(agentId: string): PersistFleetSnapshot["agents"][number] {
  return {
    agentId,
    displayName: agentId,
    role: null,
    parentAgentId: null,
    projectKey: null,
    authority: [],
    skills: [],
    lifecycle: null,
    threadId: null,
    mailbox: { state: "online", lastReadAt: null, lastSignalKind: null },
    work: {
      state: "unknown",
      activeTasks: 0,
      waitingTasks: 0,
      blockedTasks: null,
    },
    session: { claimedItems: 0, lapsedClaims: 0, completedItems: 0 },
    boards: [],
  };
}

function fleetSnapshot(): PersistFleetSnapshot {
  return {
    contractVersion: 1,
    generatedAt,
    unknownFields: { role: "not registered", parentAgentId: "not registered" },
    agents: [fleetAgent("agent-good"), fleetAgent("agent-retry")],
  };
}

function shellThread(id: string, updatedAt: string) {
  return { id: ThreadId.make(id), updatedAt };
}

function shellSnapshot(
  threads: ReadonlyArray<ReturnType<typeof shellThread>>,
): OrchestrationShellSnapshot {
  return { projects: [], threads, snapshotSequence: 1 } as unknown as OrchestrationShellSnapshot;
}

function routeThread(id: string, agentId: string, createdAt: string): OrchestrationThread {
  return {
    id: ThreadId.make(id),
    activities: [],
    messages: [
      {
        role: "user",
        text: [
          "PERSIST-Page: 2",
          'From-Agent: "sender"',
          `To-Mailbox: "${agentId}"`,
          'Message-ID: "600"',
          'Sent-At: "2026-09-04T07:00:00.000Z"',
          "",
          '"Route evidence."',
        ].join("\n"),
        createdAt,
      },
    ],
  } as unknown as OrchestrationThread;
}

describe("makePersistFleetSnapshotReader", () => {
  effectIt.effect("isolates failed threads, retries them, and preserves known routes", () =>
    Effect.gen(function* () {
      let retryThreadFails = true;
      let goodThreadFails = false;
      let goodUpdatedAt = "2026-09-04T07:00:00.000Z";
      const calls: Array<{ threadId: string; query: ProjectionThreadDetailQuery | undefined }> = [];
      const query = {
        getShellSnapshot: () =>
          Effect.succeed(
            shellSnapshot([
              shellThread("thread-good", goodUpdatedAt),
              shellThread("thread-retry", "2026-09-04T07:00:00.000Z"),
            ]),
          ),
        getThreadDetailById: (threadId: ThreadId, detailQuery?: ProjectionThreadDetailQuery) => {
          calls.push({ threadId, query: detailQuery });
          if (
            (threadId === ThreadId.make("thread-retry") && retryThreadFails) ||
            (threadId === ThreadId.make("thread-good") && goodThreadFails)
          ) {
            return Effect.die(new Error(`failed ${threadId}`));
          }
          const agentId = threadId === ThreadId.make("thread-good") ? "agent-good" : "agent-retry";
          return Effect.succeed(
            Option.some(routeThread(threadId, agentId, "2026-09-04T07:00:01.000Z")),
          );
        },
      } as unknown as ProjectionSnapshotQueryShape;
      const read = makePersistFleetSnapshotReader(query, {
        readFleet: () => Effect.succeed(fleetSnapshot()),
      });

      const partial = yield* read({ includeOffline: true });
      expect(partial.agents.map((agent) => [agent.agentId, agent.threadId])).toEqual([
        ["agent-good", ThreadId.make("thread-good")],
        ["agent-retry", null],
      ]);
      expect(calls.map((call) => call.query?.activityKinds)).toEqual([
        ["item.completed", "tool.completed"],
        ["item.completed", "tool.completed"],
      ]);

      retryThreadFails = false;
      const recovered = yield* read({ includeOffline: true });
      expect(calls.map((call) => call.threadId)).toEqual([
        "thread-good",
        "thread-retry",
        "thread-retry",
      ]);
      expect(recovered.agents.map((agent) => [agent.agentId, agent.threadId])).toEqual([
        ["agent-good", ThreadId.make("thread-good")],
        ["agent-retry", ThreadId.make("thread-retry")],
      ]);

      goodUpdatedAt = "2026-09-04T07:01:00.000Z";
      goodThreadFails = true;
      const staleButAvailable = yield* read({ includeOffline: true });
      expect(staleButAvailable.agents.map((agent) => [agent.agentId, agent.threadId])).toEqual([
        ["agent-good", ThreadId.make("thread-good")],
        ["agent-retry", ThreadId.make("thread-retry")],
      ]);
    }),
  );

  effectIt.effect("rescans unchanged threads when the fleet reveals a new agent", () =>
    Effect.gen(function* () {
      let includeRetryAgent = false;
      const calls: string[] = [];
      const query = {
        getShellSnapshot: () =>
          Effect.succeed(
            shellSnapshot([
              shellThread("thread-good", "2026-09-04T07:00:00.000Z"),
              shellThread("thread-retry", "2026-09-04T07:00:00.000Z"),
            ]),
          ),
        getThreadDetailById: (threadId: ThreadId) => {
          calls.push(threadId);
          const agentId = threadId === ThreadId.make("thread-good") ? "agent-good" : "agent-retry";
          return Effect.succeed(
            Option.some(routeThread(threadId, agentId, "2026-09-04T07:00:01.000Z")),
          );
        },
      } as unknown as ProjectionSnapshotQueryShape;
      const read = makePersistFleetSnapshotReader(query, {
        readFleet: () =>
          Effect.succeed({
            ...fleetSnapshot(),
            agents: includeRetryAgent ? fleetSnapshot().agents : [fleetSnapshot().agents[0]!],
          }),
      });

      const onlineOnly = yield* read({});
      expect(onlineOnly.agents.map((agent) => [agent.agentId, agent.threadId])).toEqual([
        ["agent-good", ThreadId.make("thread-good")],
      ]);

      includeRetryAgent = true;
      const withOffline = yield* read({ includeOffline: true });
      expect(calls).toEqual(["thread-good", "thread-retry", "thread-good", "thread-retry"]);
      expect(withOffline.agents.map((agent) => [agent.agentId, agent.threadId])).toEqual([
        ["agent-good", ThreadId.make("thread-good")],
        ["agent-retry", ThreadId.make("thread-retry")],
      ]);
    }),
  );
});
