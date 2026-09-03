import { ThreadId, type PersistFleetAgent } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";

import type { PersistThreadBinding } from "./bindingsStore";
import { mergePersistBindings } from "./mergeFleet";

const binding: PersistThreadBinding = {
  enabled: true,
  agentId: "growth-lead",
  displayName: "Growth lead",
  role: "orchestrator",
  parentAgentId: null,
  boardSlugs: ["popup-maker-growth"],
  threadId: ThreadId.make("thread-local"),
};

describe("mergePersistBindings", () => {
  it("projects a locally configured identity while PERSIST has not seen it", () => {
    const agents = mergePersistBindings([], [binding]);
    expect(agents[0]).toMatchObject({
      agentId: "growth-lead",
      displayName: "Growth lead",
      role: "orchestrator",
      threadId: "thread-local",
      mailbox: { state: "never_seen" },
      boards: [{ slug: "popup-maker-growth" }],
    });
  });

  it("keeps the live route and work data while overlaying explicit identity", () => {
    const live: PersistFleetAgent = {
      agentId: "growth-lead",
      displayName: "growth-lead",
      role: null,
      parentAgentId: null,
      projectKey: null,
      authority: [],
      skills: [],
      lifecycle: null,
      threadId: ThreadId.make("thread-live"),
      mailbox: { state: "online", lastReadAt: null, lastSignalKind: null },
      work: { state: "active", activeTasks: 2, waitingTasks: 0, blockedTasks: null },
      session: { claimedItems: 4, lapsedClaims: 1, completedItems: 3 },
      boards: [],
    };
    expect(mergePersistBindings([live], [binding])[0]).toMatchObject({
      displayName: "Growth lead",
      role: "orchestrator",
      threadId: "thread-live",
      work: { activeTasks: 2 },
    });
  });

  it("uses durable registry identity after PERSIST has registered the agent", () => {
    const live: PersistFleetAgent = {
      agentId: "growth-lead",
      displayName: "Growth Orchestrator Live",
      role: "commander",
      parentAgentId: null,
      projectKey: "growth-os",
      authority: ["fleet:manage"],
      skills: ["persist-fleet-orchestrator"],
      lifecycle: "active",
      threadId: ThreadId.make("thread-live"),
      mailbox: { state: "online", lastReadAt: null, lastSignalKind: null },
      work: { state: "active", activeTasks: 2, waitingTasks: 0, blockedTasks: null },
      session: { claimedItems: 4, lapsedClaims: 1, completedItems: 3 },
      boards: [],
    };

    expect(mergePersistBindings([live], [binding])[0]).toMatchObject({
      displayName: "Growth Orchestrator Live",
      role: "commander",
      projectKey: "growth-os",
      authority: ["fleet:manage"],
      skills: ["persist-fleet-orchestrator"],
      lifecycle: "active",
      threadId: "thread-live",
    });
  });
});
