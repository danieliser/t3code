import { beforeEach, describe, expect, it } from "@effect/vitest";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";

import { commitPersistThreadBinding, usePersistBindingsStore } from "./bindingsStore";

describe("commitPersistThreadBinding", () => {
  beforeEach(() => usePersistBindingsStore.setState({ byThreadId: {} }));

  const environmentId = EnvironmentId.make("environment-1");
  const threadRef = (threadId: string) => scopeThreadRef(environmentId, ThreadId.make(threadId));

  it("stores a validated explicit binding and replaces duplicate agent routes", () => {
    const payload = {
      enabled: true,
      agentId: "growth-lead",
      displayName: "Growth lead",
      role: "orchestrator",
      parentAgentId: null,
      boardSlugs: ["popup-maker-growth"],
    };
    commitPersistThreadBinding({ threadRef: threadRef("thread-1"), payload });
    commitPersistThreadBinding({ threadRef: threadRef("thread-2"), payload });

    expect(usePersistBindingsStore.getState().byThreadId).toEqual({
      [scopedThreadKey(threadRef("thread-2"))]: expect.objectContaining({
        environmentId,
        agentId: "growth-lead",
        role: "orchestrator",
      }),
    });
  });

  it("ignores malformed or unparented team bindings", () => {
    commitPersistThreadBinding({
      threadRef: threadRef("thread-1"),
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
