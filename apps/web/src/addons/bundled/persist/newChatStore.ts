import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "../../../lib/storage";
import {
  DEFAULT_PERSIST_NEW_CHAT_CONFIG,
  type PersistNewChatConfig,
  type PersistNewChatDraftConfig,
  persistNewChatConfigIssue,
  resolvePersistNewChatConfig,
} from "./config";

interface PersistNewChatStoreState {
  readonly byTargetKey: Readonly<Record<string, PersistNewChatDraftConfig>>;
  readonly setConfig: (targetKey: string, patch: Partial<PersistNewChatDraftConfig>) => void;
  readonly clearConfig: (targetKey: string) => void;
}

export const usePersistNewChatStore = create<PersistNewChatStoreState>()(
  persist(
    (set) => ({
      byTargetKey: {},
      setConfig: (targetKey, patch) =>
        set((state) => ({
          byTargetKey: {
            ...state.byTargetKey,
            [targetKey]: {
              ...(state.byTargetKey[targetKey] ?? DEFAULT_PERSIST_NEW_CHAT_CONFIG),
              ...patch,
            },
          },
        })),
      clearConfig: (targetKey) =>
        set((state) => {
          if (!(targetKey in state.byTargetKey)) return state;
          const { [targetKey]: _removed, ...byTargetKey } = state.byTargetKey;
          return { byTargetKey };
        }),
    }),
    {
      name: "t3code:addon:persist:new-chat:v1",
      version: 1,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({ byTargetKey: state.byTargetKey }),
    },
  ),
);

export function readPersistNewChatConfig(targetKey: string): PersistNewChatConfig | null {
  const draft = usePersistNewChatStore.getState().byTargetKey[targetKey];
  if (!draft?.enabled || persistNewChatConfigIssue(draft) !== null) return null;
  return resolvePersistNewChatConfig(draft);
}

export function clearPersistNewChatConfig(targetKey: string): void {
  usePersistNewChatStore.getState().clearConfig(targetKey);
}
