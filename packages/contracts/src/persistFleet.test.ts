import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { PERSIST_FLEET_CONTRACT_VERSION, PersistFleetSnapshot } from "./persistFleet.ts";

const decodeSnapshot = Schema.decodeUnknownSync(PersistFleetSnapshot);

function validSnapshot() {
  return {
    contractVersion: PERSIST_FLEET_CONTRACT_VERSION,
    generatedAt: "2026-09-02T10:40:00.000Z",
    unknownFields: { role: null, parentAgentId: null },
    agents: [
      {
        agentId: "persist-orchestrator",
        displayName: "PERSIST Orchestrator",
        role: "orchestrator",
        parentAgentId: null,
        threadId: "thread-parent",
        mailbox: {
          state: "online",
          lastReadAt: "2026-09-02T10:39:00.000Z",
          lastSignalKind: "message.injected",
        },
        work: {
          state: "active",
          activeTasks: 1,
          waitingTasks: 0,
          blockedTasks: 0,
        },
        session: {
          claimedItems: 3,
          lapsedClaims: 0,
          completedItems: 2,
        },
        boards: [
          {
            boardId: "board-persistence",
            slug: "persistence",
            title: "PERSIST",
            url: "http://127.0.0.1:8803/boards/persistence",
            assignedItems: 1,
            completedItems: 2,
          },
        ],
      },
    ],
  } as const;
}

describe("PersistFleetSnapshot", () => {
  it("decodes explicit durable identity and live-route fields", () => {
    expect(decodeSnapshot(validSnapshot())).toEqual(validSnapshot());
  });

  it("preserves unknown work state instead of manufacturing idle or blocked", () => {
    const input = validSnapshot();
    const snapshot = decodeSnapshot({
      ...input,
      agents: [
        {
          ...input.agents[0],
          role: null,
          parentAgentId: null,
          work: {
            state: "unknown",
            activeTasks: null,
            waitingTasks: null,
            blockedTasks: null,
          },
          session: {
            claimedItems: null,
            lapsedClaims: null,
            completedItems: null,
          },
        },
      ],
    });

    expect(snapshot.agents[0]?.work.state).toBe("unknown");
    expect(snapshot.agents[0]?.role).toBeNull();
  });

  it("rejects inferred role names and unversioned payloads", () => {
    const input = validSnapshot();
    expect(() =>
      decodeSnapshot({
        ...input,
        agents: [{ ...input.agents[0], role: "orchestrator-because-name-matched" }],
      }),
    ).toThrow();
    expect(() => decodeSnapshot({ ...input, contractVersion: 0 })).toThrow();
  });
});
