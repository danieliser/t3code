import { beforeEach, describe, expect, it } from "@effect/vitest";

import { commitPersistThreadBinding, usePersistBindingsStore } from "./bindingsStore";

describe("commitPersistThreadBinding", () => {
  beforeEach(() => usePersistBindingsStore.setState({ byThreadId: {} }));

  it("stores a validated explicit binding and replaces duplicate agent routes", () => {
    const payload = {
      enabled: true,
      agentId: "growth-lead",
      displayName: "Growth lead",
      role: "orchestrator",
      parentAgentId: null,
      boardSlugs: ["popup-maker-growth"],
    };
    commitPersistThreadBinding({ threadId: "thread-1", payload });
    commitPersistThreadBinding({ threadId: "thread-2", payload });

    expect(usePersistBindingsStore.getState().byThreadId).toEqual({
      "thread-2": expect.objectContaining({ agentId: "growth-lead", role: "orchestrator" }),
    });
  });

  it("ignores malformed or unparented team bindings", () => {
    commitPersistThreadBinding({
      threadId: "thread-1",
      payload: {
        enabled: true,
        agentId: "worker",
        displayName: "Worker",
        role: "team_member",
        parentAgentId: null,
        boardSlugs: [],
      },
    });
    expect(usePersistBindingsStore.getState().byThreadId).toEqual({});
  });
});
