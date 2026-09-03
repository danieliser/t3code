import type { PersistFleetAgent } from "@t3tools/contracts";

export interface PersistFleetThreadMember<TThread> {
  readonly thread: TThread;
  readonly agent: PersistFleetAgent;
}

export interface PersistFleetThreadGroup<TThread> {
  readonly thread: TThread;
  readonly agent: PersistFleetAgent | null;
  readonly children: readonly PersistFleetThreadMember<TThread>[];
}

export interface PersistFleetAgentGroup {
  readonly agent: PersistFleetAgent;
  readonly children: readonly PersistFleetAgent[];
}

/**
 * One T3 thread can legitimately route more than one PERSIST identity (for
 * example, when a mailbox role is renamed or handed over). Keep each row
 * contribution stable and distinct without treating the thread as the agent.
 */
export function persistThreadContributionId(agentId: string): string {
  return `fleet-status:${agentId}`;
}

export function persistThreadContributionKind(input: {
  readonly agent: PersistFleetAgent;
  readonly hasParentThread: boolean;
  readonly childCount: number;
}): "parent" | "child" | "standalone" {
  if (input.hasParentThread) return "child";
  if (
    input.childCount > 0 ||
    input.agent.role === "commander" ||
    input.agent.role === "orchestrator"
  ) {
    return "parent";
  }
  return "standalone";
}

export function groupPersistFleetAgents(
  agents: readonly PersistFleetAgent[],
): readonly PersistFleetAgentGroup[] {
  const byId = new Map(agents.map((agent) => [agent.agentId, agent]));
  const childrenByParent = new Map<string, PersistFleetAgent[]>();
  const roots: PersistFleetAgent[] = [];
  for (const agent of agents) {
    const parent = agent.parentAgentId === null ? null : byId.get(agent.parentAgentId);
    if (parent?.role !== "orchestrator") {
      roots.push(agent);
      continue;
    }
    const children = childrenByParent.get(parent.agentId) ?? [];
    children.push(agent);
    childrenByParent.set(parent.agentId, children);
  }
  return roots.map((agent) => ({
    agent,
    children: childrenByParent.get(agent.agentId) ?? [],
  }));
}

/**
 * Groups routed thread rows using only explicit, typed PERSIST facts.
 *
 * An agent remains top-level when its parent is absent, unrouted, or is not an
 * orchestrator. This keeps incomplete registry data visible without inventing
 * a hierarchy from names.
 */
export function groupPersistFleetThreads<TThread extends { readonly id: string }>(
  threads: readonly TThread[],
  agents: readonly PersistFleetAgent[],
): readonly PersistFleetThreadGroup<TThread>[] {
  const agentByThreadId = new Map<string, PersistFleetAgent>();
  const agentById = new Map<string, PersistFleetAgent>();
  const threadById = new Map(threads.map((item) => [item.id, item]));

  for (const agent of agents) {
    agentById.set(agent.agentId, agent);
    if (agent.threadId !== null && !agentByThreadId.has(agent.threadId)) {
      agentByThreadId.set(agent.threadId, agent);
    }
  }

  const childrenByParentAgentId = new Map<string, PersistFleetThreadMember<TThread>[]>();
  const groupedChildThreadIds = new Set<string>();

  for (const agent of agents) {
    if (agent.threadId === null || agent.parentAgentId === null) continue;
    const childThread = threadById.get(agent.threadId);
    const parentAgent = agentById.get(agent.parentAgentId);
    if (
      childThread === undefined ||
      parentAgent?.role !== "orchestrator" ||
      parentAgent.threadId === null ||
      !threadById.has(parentAgent.threadId)
    ) {
      continue;
    }
    const children = childrenByParentAgentId.get(parentAgent.agentId) ?? [];
    children.push({ thread: childThread, agent });
    childrenByParentAgentId.set(parentAgent.agentId, children);
    groupedChildThreadIds.add(childThread.id);
  }

  return threads.flatMap((thread) => {
    if (groupedChildThreadIds.has(thread.id)) return [];
    const agent = agentByThreadId.get(thread.id) ?? null;
    return [
      {
        thread,
        agent,
        children: agent === null ? [] : (childrenByParentAgentId.get(agent.agentId) ?? []),
      },
    ];
  });
}
