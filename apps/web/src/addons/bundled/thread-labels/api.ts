import type { ThreadLabel } from "../../../threadLabels";
import { useUiStateStore } from "../../../uiStateStore";

export interface ThreadLabelApiSnapshot {
  readonly labels: readonly ThreadLabel[];
  readonly labelIdsByThreadKey: Readonly<Record<string, readonly string[]>>;
}

export interface ThreadLabelApi {
  readonly snapshot: () => ThreadLabelApiSnapshot;
  readonly ensure: (name: string, color: string) => string | null;
  readonly update: (labelId: string, name: string, color: string) => boolean;
  readonly remove: (labelId: string) => boolean;
  readonly setAssigned: (
    threadKeys: string | readonly string[],
    labelId: string,
    assigned: boolean,
  ) => boolean;
  readonly subscribe: (listener: (snapshot: ThreadLabelApiSnapshot) => void) => () => void;
}

function snapshot(): ThreadLabelApiSnapshot {
  const state = useUiStateStore.getState();
  return {
    labels: state.threadLabels.map((label) => ({ ...label })),
    labelIdsByThreadKey: Object.fromEntries(
      Object.entries(state.threadLabelIdsByThreadKey).map(([threadKey, labelIds]) => [
        threadKey,
        [...labelIds],
      ]),
    ),
  };
}

export const threadLabelApi: ThreadLabelApi = {
  snapshot,
  ensure: (name, color) => useUiStateStore.getState().createThreadLabel(name, color),
  update: (labelId, name, color) =>
    useUiStateStore.getState().updateThreadLabel(labelId, name, color),
  remove: (labelId) => {
    const state = useUiStateStore.getState();
    if (!state.threadLabels.some((label) => label.id === labelId)) return false;
    state.deleteThreadLabel(labelId);
    return true;
  },
  setAssigned: (threadKeys, labelId, assigned) => {
    const before = useUiStateStore.getState().threadLabelIdsByThreadKey;
    useUiStateStore.getState().setThreadLabelAssigned(threadKeys, labelId, assigned);
    return useUiStateStore.getState().threadLabelIdsByThreadKey !== before;
  },
  subscribe: (listener) =>
    useUiStateStore.subscribe(() => {
      listener(snapshot());
    }),
};
