import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { useMemo } from "react";

import type { SidebarAddon, SidebarThreadAddonContribution } from "../../sidebar";
import { primaryPersistFleetAtom } from "../../../state/server";
import { SidebarFleetAgentMeta } from "./SidebarFleetAgentMeta";
import { usePersistBindingsStore } from "./bindingsStore";
import { persistThreadContributionKind } from "./grouping";
import { mergePersistBindings } from "./mergeFleet";

function usePersistThreadContributions(
  _threads: readonly EnvironmentThreadShell[],
): readonly SidebarThreadAddonContribution[] {
  const snapshot = useAtomValue(primaryPersistFleetAtom);
  const bindingsByThreadId = usePersistBindingsStore((state) => state.byThreadId);
  return useMemo(() => {
    const bindings = Object.values(bindingsByThreadId);
    const agents = mergePersistBindings(snapshot?.agents ?? [], bindings);
    const byAgentId = new Map(agents.map((agent) => [agent.agentId, agent]));
    const threadIdByAgentId = new Map(
      agents.flatMap((agent) => (agent.threadId === null ? [] : [[agent.agentId, agent.threadId]])),
    );

    return agents.flatMap((agent) => {
      if (agent.threadId === null) return [];
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
          addonId: "persist",
          threadId: agent.threadId,
          parentThreadId,
          kind,
          compact: <SidebarFleetAgentMeta agent={agent} variant="compact" />,
          card: <SidebarFleetAgentMeta agent={agent} variant="card" childCount={childCount} />,
          cardClassName:
            kind === "parent"
              ? "ring-1 ring-fuchsia-500/50 shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-fuchsia-500)_16%,transparent)]"
              : "ring-1 ring-fuchsia-500/25",
        } satisfies SidebarThreadAddonContribution,
      ];
    });
  }, [bindingsByThreadId, snapshot]);
}

export const persistSidebarAddon: SidebarAddon = {
  useThreadContributions: usePersistThreadContributions,
};
