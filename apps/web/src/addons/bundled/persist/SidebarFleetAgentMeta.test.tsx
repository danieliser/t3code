import type { PersistFleetAgent } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import {
  persistAgentDisplayName,
  SidebarFleetAgentHoverDetail,
  SidebarFleetAgentMeta,
} from "./SidebarFleetAgentMeta";

const agent = (overrides: Partial<PersistFleetAgent> = {}): PersistFleetAgent => ({
  agentId: "persist-orchestrator",
  displayName: "PERSIST Orchestrator",
  role: "orchestrator",
  parentAgentId: null,
  projectKey: "persistence",
  authority: [],
  skills: [],
  lifecycle: "active",
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
    lapsedClaims: 0,
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
    expect(markup).toContain("Online");
    expect(markup).toContain("2 agents");
    expect(markup).toContain("4 claimed");
    expect(markup).toContain("3 done");
    expect(markup).toContain('href="http://127.0.0.1:8803/boards/persistence"');
    expect(markup).toContain("PERSIST");
    expect(markup).toContain("overflow-hidden");
    expect(markup).toContain("@container/persist-meta");
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
          session: { claimedItems: null, lapsedClaims: null, completedItems: null },
          boards: [],
        })}
        variant="compact"
      />,
    );

    expect(markup).toContain('data-testid="sidebar-fleet-agent-name"');
    expect(markup).toContain("Team agent");
    expect(markup).toContain("Work unknown");
    expect(markup).not.toContain("Waiting");
    expect(markup).not.toContain("Blocked");
  });

  it("humanizes an unregistered fallback id without replacing a registered display name", () => {
    expect(
      persistAgentDisplayName(
        agent({ agentId: "t3-mailbox-reactor", displayName: "t3-mailbox-reactor" }),
      ),
    ).toBe("T3 Mailbox Reactor");
    expect(
      persistAgentDisplayName(
        agent({ agentId: "t3-mailbox-reactor", displayName: "Mailbox Wake Reactor" }),
      ),
    ).toBe("Mailbox Wake Reactor");
  });

  it("renders fleet identity and work details for the core hover-card slot", () => {
    const markup = renderToStaticMarkup(
      <SidebarFleetAgentHoverDetail agent={agent()} childCount={2} />,
    );

    expect(markup).toContain('data-testid="sidebar-fleet-agent-hover-detail"');
    expect(markup).toContain("persist-orchestrator");
    expect(markup).toContain("Orchestrator");
    expect(markup).toContain("Managed team");
    expect(markup).toContain("2 agents");
    expect(markup).toContain('2</div><div class="text-[10px] text-[#9adbc8]">running');
    expect(markup).toContain("4 claimed");
    expect(markup).toContain('3</div><div class="text-[10px] text-[#9adbc8]">done');
    expect(markup).toContain('href="http://127.0.0.1:8803/boards/persistence"');
    expect(markup).toContain("jarvis-avatar.png");
  });
});
