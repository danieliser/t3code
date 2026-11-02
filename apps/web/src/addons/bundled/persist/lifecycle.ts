import { useEffect } from "react";

import { useAllEnvironmentProjectSnapshotsReady, useThreadShells } from "../../../state/entities";
import { prunePersistThreadBindings } from "./bindingsStore";

export function PersistLifecycle() {
  const snapshotsReady = useAllEnvironmentProjectSnapshotsReady();
  const threads = useThreadShells();

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- prunes the persisted binding registry as authenticated environment snapshots change
  useEffect(() => {
    prunePersistThreadBindings({ snapshotsReady, threads });
  }, [snapshotsReady, threads]);

  return null;
}
