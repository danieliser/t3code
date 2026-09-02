import type { PersistFleetAgent } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { SidebarFleetAgentMeta } from "./SidebarFleetAgentMeta";

const agent = (overrides: Partial<PersistFleetAgent> = {}): PersistFleetAgent => ({
  agentId: "persist-orchestrator",
  displayName: "PERSIST Orchestrator",
  role: "orchestrator",
  parentAgentId: null,
  threadId: "thread-parent" as PersistFleetAgent["threadId"],
  mailbox: {
    state: "online",
    lastReadAt: "2026-09-02T10:39:00.000Z",
    lastSignalKind: "message.injected",
  },
  work: {
    state: "active",
    activeTasks: 2,
    waitingTasks: 1,
    blockedTasks: 0,
  },
  session: {
    claimedItems: 4,
    completedItems: 3,
  },
  boards: [
    {
      boardId: "board-persistence",
      slug: "persistence",
      title: "PERSIST",
      url: "http://127.0.0.1:8803/boards/persistence",
      assignedItems: 2,
      completedItems: 3,
    },
  ],
  ...overrides,
});

describe("SidebarFleetAgentMeta", () => {
  it("renders orchestrator identity, work evidence, session totals, and board links", () => {
    const markup = renderToStaticMarkup(
      <SidebarFleetAgentMeta agent={agent()} variant="card" childCount={2} />,
    );

    expect(markup).toContain("PERSIST Orchestrator");
    expect(markup).toContain("Orchestrator");
    expect(markup).toContain("Running");
    expect(markup).toContain("2 agents");
    expect(markup).toContain("3 done");
    expect(markup).toContain('href="http://127.0.0.1:8803/boards/persistence"');
    expect(markup).toContain("PERSIST");
  });

  it("renders unknown literally when PERSIST has no trustworthy work signal", () => {
    const markup = renderToStaticMarkup(
      <SidebarFleetAgentMeta
        agent={agent({
          role: "team_member",
          work: {
            state: "unknown",
            activeTasks: null,
            waitingTasks: null,
            blockedTasks: null,
          },
          session: { claimedItems: null, completedItems: null },
          boards: [],
        })}
        variant="compact"
      />,
    );

    expect(markup).toContain("Team agent");
    expect(markup).toContain("Unknown");
    expect(markup).not.toContain("Waiting");
    expect(markup).not.toContain("Blocked");
  });
});
