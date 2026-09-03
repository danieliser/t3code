import { beforeEach, describe, expect, it, vi } from "@effect/vitest";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";

import { commitPersistThreadBinding, usePersistBindingsStore } from "./bindingsStore";
import { persistComposerAddon } from "./composer";

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

  it("registers through the server addon API before committing the local route", async () => {
    const executeServerAction = vi.fn(async () => ({}));
    const payload = {
      enabled: true,
      agentId: "growth-lead",
      displayName: "Growth lead",
      role: "orchestrator" as const,
      parentAgentId: null,
      boardSlugs: ["popup-maker-growth"],
    };
    await persistComposerAddon.commitSubmission?.({
      targetKey: "draft:1",
      threadRef: threadRef("thread-1"),
      revision: "1",
      payload,
      host: { executeServerAction },
    });
    expect(executeServerAction).toHaveBeenCalledWith({
      addonId: "persist",
      actionId: "fleet.agent.upsert",
      payload,
    });
    expect(usePersistBindingsStore.getState().byThreadId).toHaveProperty(
      scopedThreadKey(threadRef("thread-1")),
    );
  });

  it("does not create a local route when durable registration fails", async () => {
    await expect(
      persistComposerAddon.commitSubmission?.({
        targetKey: "draft:1",
        threadRef: threadRef("thread-1"),
        revision: "1",
        payload: {
          enabled: true,
          agentId: "growth-lead",
          displayName: "Growth lead",
          role: "orchestrator",
          parentAgentId: null,
          boardSlugs: [],
        },
        host: { executeServerAction: async () => Promise.reject(new Error("offline")) },
      }),
    ).rejects.toThrow("offline");
    expect(usePersistBindingsStore.getState().byThreadId).toEqual({});
  });
});
