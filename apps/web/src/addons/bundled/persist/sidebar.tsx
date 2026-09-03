import { useAtomValue } from "@effect/atom-react";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { useMemo } from "react";

import type { SidebarAddon, SidebarThreadAddonContributionInput } from "../../sidebar";
import { primaryPersistFleetAtom } from "../../../state/server";
import { usePrimaryEnvironmentId } from "../../../state/environments";
import { SidebarFleetAgentMeta } from "./SidebarFleetAgentMeta";
import { usePersistBindingsStore } from "./bindingsStore";
import { persistThreadContributionId, persistThreadContributionKind } from "./grouping";
import { mergePersistBindings } from "./mergeFleet";

function usePersistThreadContributions(
  threads: readonly EnvironmentThreadShell[],
): readonly SidebarThreadAddonContributionInput[] {
  const snapshot = useAtomValue(primaryPersistFleetAtom);
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const bindingsByThreadId = usePersistBindingsStore((state) => state.byThreadId);
  return useMemo(() => {
    if (primaryEnvironmentId === null) return [];
    const threadIds = new Set(
      threads
        .filter((thread) => thread.environmentId === primaryEnvironmentId)
        .map((thread) => thread.id),
    );
    const bindings = Object.values(bindingsByThreadId).filter(
      (binding) =>
        (binding.environmentId === undefined || binding.environmentId === primaryEnvironmentId) &&
        threadIds.has(binding.threadId),
    );
    const agents = mergePersistBindings(snapshot?.agents ?? [], bindings);
    const byAgentId = new Map(agents.map((agent) => [agent.agentId, agent]));
    const threadIdByAgentId = new Map(
      agents.flatMap((agent) => (agent.threadId === null ? [] : [[agent.agentId, agent.threadId]])),
    );

    return agents.flatMap((agent) => {
      if (agent.threadId === null || !threadIds.has(agent.threadId)) return [];
      const parent =
        agent.parentAgentId === null ? null : (byAgentId.get(agent.parentAgentId) ?? null);
      const parentThreadId =
        parent?.role === "orchestrator" ? (threadIdByAgentId.get(parent.agentId) ?? null) : null;
      const childCount =
        agent.role === "orchestrator"
          ? agents.filter(
              (candidate) =>
                candidate.parentAgentId === agent.agentId && candidate.threadId !== null,
            ).length
          : 0;
      const kind = persistThreadContributionKind({
        agent,
        hasParentThread: parentThreadId !== null,
        childCount,
      });
      return [
        {
          contributionId: persistThreadContributionId(agent.agentId),
          threadRef: scopeThreadRef(primaryEnvironmentId, agent.threadId),
          parentThreadRef:
            parentThreadId === null ? null : scopeThreadRef(primaryEnvironmentId, parentThreadId),
          kind,
          compact: <SidebarFleetAgentMeta agent={agent} variant="compact" />,
          card: <SidebarFleetAgentMeta agent={agent} variant="card" childCount={childCount} />,
          cardClassName:
            kind === "parent"
              ? "ring-1 ring-fuchsia-500/50 shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-fuchsia-500)_16%,transparent)]"
              : "ring-1 ring-fuchsia-500/25",
        } satisfies SidebarThreadAddonContributionInput,
      ];
    });
  }, [bindingsByThreadId, primaryEnvironmentId, snapshot, threads]);
}

export const persistSidebarAddon: SidebarAddon = {
  useThreadContributions: usePersistThreadContributions,
};
