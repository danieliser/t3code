import { useEffect } from "react";

import { useUiStateStore } from "../uiStateStore";

export function useMarkActiveThreadVisited(
  threadKey: string | null,
  latestTurnCompletedAt: string | null,
): void {
  const markActiveThreadVisited = useUiStateStore((store) => store.markActiveThreadVisited);

  useEffect(() => {
    if (threadKey === null || latestTurnCompletedAt === null) {
      markActiveThreadVisited(null, null);
      return;
    }
    markActiveThreadVisited(threadKey, latestTurnCompletedAt);
  }, [latestTurnCompletedAt, markActiveThreadVisited, threadKey]);
}
