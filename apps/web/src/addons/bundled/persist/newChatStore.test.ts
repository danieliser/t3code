import { beforeEach, describe, expect, it } from "@effect/vitest";

import {
  clearPersistNewChatConfig,
  readPersistNewChatConfig,
  usePersistNewChatStore,
} from "./newChatStore";

describe("PERSIST new chat staging", () => {
  beforeEach(() => usePersistNewChatStore.setState({ byTargetKey: {} }));

  it("preserves newer edits when an older submission finishes", () => {
    const targetKey = "draft:1";
    usePersistNewChatStore.getState().setConfig(targetKey, {
      enabled: true,
      agentId: "growth-lead",
      displayName: "Growth lead",
      role: "orchestrator",
      boardSlugsText: "popup-maker-growth",
    });
    const snapshot = readPersistNewChatConfig(targetKey);
    expect(snapshot).not.toBeNull();

    usePersistNewChatStore.getState().setConfig(targetKey, { displayName: "Growth commander" });
    clearPersistNewChatConfig({
      targetKey,
      expectedRevision: snapshot?.revision ?? null,
      reason: "submitted",
    });

    expect(usePersistNewChatStore.getState().byTargetKey[targetKey]?.displayName).toBe(
      "Growth commander",
    );
  });

  it("discards invalid staged state even when no submission payload is readable", () => {
    const targetKey = "draft:invalid";
    usePersistNewChatStore.getState().setConfig(targetKey, {
      enabled: true,
      agentId: "",
    });
    expect(readPersistNewChatConfig(targetKey)).toBeNull();

    clearPersistNewChatConfig({ targetKey, expectedRevision: null, reason: "discarded" });

    expect(usePersistNewChatStore.getState().byTargetKey[targetKey]).toBeUndefined();
  });
});
