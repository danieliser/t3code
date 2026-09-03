import { describe, expect, it } from "@effect/vitest";

import {
  DEFAULT_PERSIST_NEW_CHAT_CONFIG,
  normalizePersistAgentId,
  parsePersistBoardSlugs,
  persistNewChatConfigIssue,
  resolvePersistNewChatConfig,
} from "./config";

describe("PERSIST new-chat configuration", () => {
  it("normalizes an explicitly entered stable agent id", () => {
    expect(normalizePersistAgentId("  Growth OS / Lead  ")).toBe("growth-os-lead");
  });

  it("trims and de-duplicates explicit board slugs", () => {
    expect(parsePersistBoardSlugs("persistence, popup-maker-growth, persistence, ")).toEqual([
      "persistence",
      "popup-maker-growth",
    ]);
  });

  it("resolves a durable binding payload without carrying raw form text", () => {
    expect(
      resolvePersistNewChatConfig({
        ...DEFAULT_PERSIST_NEW_CHAT_CONFIG,
        enabled: true,
        agentId: " Growth Lead ",
        displayName: " Growth Lead ",
        role: "orchestrator",
        parentAgentId: "must-not-survive",
        boardSlugsText: "persistence, popup-maker-growth, persistence",
      }),
    ).toEqual({
      enabled: true,
      agentId: "growth-lead",
      displayName: "Growth Lead",
      role: "orchestrator",
      parentAgentId: null,
      boardSlugs: ["persistence", "popup-maker-growth"],
    });
  });

  it("requires explicit identity and parentage without inferring either", () => {
    expect(
      persistNewChatConfigIssue({
        ...DEFAULT_PERSIST_NEW_CHAT_CONFIG,
        enabled: true,
        role: "team_member",
      }),
    ).toBe("Agent ID is required");
    expect(
      persistNewChatConfigIssue({
        ...DEFAULT_PERSIST_NEW_CHAT_CONFIG,
        enabled: true,
        agentId: "growth-worker",
        displayName: "Growth worker",
        role: "team_member",
      }),
    ).toBe("Choose a parent orchestrator");
    expect(
      persistNewChatConfigIssue({
        ...DEFAULT_PERSIST_NEW_CHAT_CONFIG,
        enabled: true,
        agentId: "***",
        displayName: "Invalid agent",
      }),
    ).toBe("Agent ID is required");
  });
});
