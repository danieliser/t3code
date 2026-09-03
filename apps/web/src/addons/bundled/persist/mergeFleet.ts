import type { PersistFleetAgent } from "@t3tools/contracts";

import type { PersistThreadBinding } from "./bindingsStore";

function boardTitle(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function bindingBoards(
  binding: PersistThreadBinding,
  current: PersistFleetAgent | null,
): PersistFleetAgent["boards"] {
  const currentBySlug = new Map((current?.boards ?? []).map((board) => [board.slug, board]));
  return binding.boardSlugs.map(
    (slug) =>
      currentBySlug.get(slug) ?? {
        boardId: slug,
        slug,
        title: boardTitle(slug),
        url: `http://127.0.0.1:5173/boards/${encodeURIComponent(slug)}`,
        assignedItems: null,
        completedItems: null,
      },
  );
}

export function mergePersistBindings(
  agents: readonly PersistFleetAgent[],
  bindings: readonly PersistThreadBinding[],
): readonly PersistFleetAgent[] {
  const byAgentId = new Map(agents.map((agent) => [agent.agentId, agent]));
  for (const binding of bindings) {
    const current = byAgentId.get(binding.agentId) ?? null;
    byAgentId.set(binding.agentId, {
      agentId: binding.agentId,
      displayName: binding.displayName,
      role: binding.role,
      parentAgentId: binding.parentAgentId,
      projectKey: null,
      authority: [],
      skills: [],
      lifecycle: "active",
      threadId: current?.threadId ?? (binding.threadId as PersistFleetAgent["threadId"]),
      mailbox: current?.mailbox ?? {
        state: "never_seen",
        lastReadAt: null,
        lastSignalKind: null,
      },
      work: current?.work ?? {
        state: "unknown",
        activeTasks: 0,
        waitingTasks: 0,
        blockedTasks: null,
      },
      session: current?.session ?? {
        claimedItems: null,
        lapsedClaims: null,
        completedItems: null,
      },
      boards: bindingBoards(binding, current),
    });
  }
  return [...byAgentId.values()];
}
