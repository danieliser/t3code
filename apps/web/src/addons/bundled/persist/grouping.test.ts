import { ThreadId, type PersistFleetAgent } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  groupPersistFleetAgents,
  groupPersistFleetThreads,
  persistThreadContributionKind,
} from "./grouping";

type TestThread = {
  readonly id: string;
  readonly title: string;
};

const thread = (id: string, title = id): TestThread => ({ id, title });

const agent = (overrides: Partial<PersistFleetAgent>): PersistFleetAgent => ({
  agentId: "agent",
  displayName: "Agent",
  role: null,
  parentAgentId: null,
  projectKey: null,
  authority: [],
  skills: [],
  lifecycle: "active",
  threadId: null,
  mailbox: {
    state: "never_seen",
    lastReadAt: null,
    lastSignalKind: null,
  },
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
  boards: [],
  ...overrides,
});

describe("groupPersistFleetAgents", () => {
  it("nests only explicitly parented agents under an explicitly typed orchestrator", () => {
    const groups = groupPersistFleetAgents([
      agent({ agentId: "parent", role: "orchestrator" }),
      agent({ agentId: "child", role: "team_member", parentAgentId: "parent" }),
      agent({ agentId: "unknown-parent", role: null }),
      agent({ agentId: "not-a-child", parentAgentId: "unknown-parent" }),
    ]);
    expect(
      groups.map((group) => [group.agent.agentId, group.children.map((child) => child.agentId)]),
    ).toEqual([
      ["parent", ["child"]],
      ["unknown-parent", []],
      ["not-a-child", []],
    ]);
  });
});

describe("groupPersistFleetThreads", () => {
  it("marries an explicitly typed child row to its orchestrator", () => {
    const parent = thread("thread-parent");
    const child = thread("thread-child");
    const unrelated = thread("thread-other");
    const groups = groupPersistFleetThreads(
      [parent, child, unrelated],
      [
        agent({
          agentId: "fleet-parent",
          displayName: "Fleet parent",
          role: "orchestrator",
          threadId: ThreadId.make(parent.id),
        }),
        agent({
          agentId: "fleet-child",
          displayName: "Fleet child",
          role: "team_member",
          parentAgentId: "fleet-parent",
          threadId: ThreadId.make(child.id),
        }),
      ],
    );

    expect(groups).toEqual([
      {
        thread: parent,
        agent: expect.objectContaining({ agentId: "fleet-parent" }),
        children: [
          {
            thread: child,
            agent: expect.objectContaining({ agentId: "fleet-child" }),
          },
        ],
      },
      { thread: unrelated, agent: null, children: [] },
    ]);
    expect(groups[0]?.children[0]?.agent.work.state).toBe("unknown");
  });

  it("never infers parentage from agent handles or thread titles", () => {
    const parent = thread("thread-parent", "Orchestrator chat");
    const child = thread("thread-child", "Team agent for orchestrator");
    const groups = groupPersistFleetThreads(
      [parent, child],
      [
        agent({
          agentId: "orchestrator-looking-name",
          displayName: "Looks like an orchestrator",
          role: null,
          threadId: ThreadId.make(parent.id),
        }),
        agent({
          agentId: "team-agent-looking-name",
          displayName: "Looks like a child",
          role: "team_member",
          parentAgentId: null,
          threadId: ThreadId.make(child.id),
        }),
      ],
    );

    expect(groups.map((group) => [group.thread.id, group.children.length])).toEqual([
      [parent.id, 0],
      [child.id, 0],
    ]);
  });

  it("leaves orphans top-level until real parentage and a parent route exist", () => {
    const child = thread("thread-child");
    const groups = groupPersistFleetThreads(
      [child],
      [
        agent({
          agentId: "fleet-child",
          role: "team_member",
          parentAgentId: "missing-parent",
          threadId: ThreadId.make(child.id),
        }),
      ],
    );

    expect(groups).toEqual([
      {
        thread: child,
        agent: expect.objectContaining({ agentId: "fleet-child" }),
        children: [],
      },
    ]);
  });
});

describe("persistThreadContributionKind", () => {
  it("keeps an explicitly typed orchestrator visually distinct before children arrive", () => {
    expect(
      persistThreadContributionKind({
        agent: agent({ agentId: "orchestrator", role: "orchestrator" }),
        hasParentThread: false,
        childCount: 0,
      }),
    ).toBe("parent");
  });

  it("prefers explicit parentage over the agent role", () => {
    expect(
      persistThreadContributionKind({
        agent: agent({ agentId: "worker", role: "product" }),
        hasParentThread: true,
        childCount: 0,
      }),
    ).toBe("child");
  });
});
