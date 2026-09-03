import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type {
  EnvironmentId,
  PersistFleetRole,
  ScopedThreadRef,
  ThreadId,
} from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "../../../lib/storage";
import type { PersistNewChatConfig } from "./config";

export interface PersistThreadBinding extends PersistNewChatConfig {
  /** Undefined only for bindings written by the v1 unscoped store. */
  readonly environmentId?: EnvironmentId;
  readonly threadId: ThreadId;
}

interface PersistBindingsState {
  readonly byThreadId: Readonly<Record<string, PersistThreadBinding>>;
  readonly bind: (binding: PersistThreadBinding) => void;
}

const ROLES = new Set<PersistFleetRole>([
  "commander",
  "orchestrator",
  "product",
  "team_member",
  "coordinator",
]);

function decodeBindingPayload(payload: unknown): PersistNewChatConfig | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  const value = payload as Record<string, unknown>;
  if (
    value.enabled !== true ||
    typeof value.agentId !== "string" ||
    value.agentId.trim() === "" ||
    typeof value.displayName !== "string" ||
    value.displayName.trim() === "" ||
    typeof value.role !== "string" ||
    !ROLES.has(value.role as PersistFleetRole) ||
    !Array.isArray(value.boardSlugs) ||
    !value.boardSlugs.every((slug) => typeof slug === "string")
  ) {
    return null;
  }
  const role = value.role as PersistFleetRole;
  const parentAgentId =
    role === "team_member" && typeof value.parentAgentId === "string"
      ? value.parentAgentId.trim() || null
      : null;
  if (role === "team_member" && parentAgentId === null) return null;
  return {
    enabled: true,
    agentId: value.agentId.trim(),
    displayName: value.displayName.trim(),
    role,
    parentAgentId,
    boardSlugs: [...new Set(value.boardSlugs.map((slug) => slug.trim()).filter(Boolean))],
  };
}

export const usePersistBindingsStore = create<PersistBindingsState>()(
  persist(
    (set) => ({
      byThreadId: {},
      bind: (binding) =>
        set((state) => {
          const bindingKey =
            binding.environmentId === undefined
              ? binding.threadId
              : scopedThreadKey(scopeThreadRef(binding.environmentId, binding.threadId));
          const withoutDuplicateAgent = Object.fromEntries(
            Object.entries(state.byThreadId).filter(
              ([threadKey, current]) =>
                threadKey === bindingKey || current.agentId !== binding.agentId,
            ),
          );
          return {
            byThreadId: {
              ...withoutDuplicateAgent,
              [bindingKey]: binding,
            },
          };
        }),
    }),
    {
      name: "t3code:addon:persist:bindings:v1",
      version: 1,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({ byThreadId: state.byThreadId }),
    },
  ),
);

export function commitPersistThreadBinding(input: {
  readonly threadRef: ScopedThreadRef;
  readonly payload: unknown;
}): void {
  const config = decodeBindingPayload(input.payload);
  if (config === null) return;
  usePersistBindingsStore.getState().bind({
    ...config,
    environmentId: input.threadRef.environmentId,
    threadId: input.threadRef.threadId,
  });
}
