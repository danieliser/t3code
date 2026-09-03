import { EventId, ThreadId, type OrchestrationThreadActivity } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { discoverPersistThreadRoutes } from "./PersistThreadRoutes.ts";

const activity = (
  id: string,
  createdAt: string,
  payload: unknown,
  kind = "item.completed",
): OrchestrationThreadActivity => ({
  id: EventId.make(id),
  tone: "tool",
  kind,
  summary: "tool completed",
  payload,
  turnId: null,
  createdAt: createdAt as OrchestrationThreadActivity["createdAt"],
});

describe("discoverPersistThreadRoutes", () => {
  it("resolves the newest completed Codex mailbox send for a known agent", () => {
    const routes = discoverPersistThreadRoutes(
      [
        {
          id: ThreadId.make("older-thread"),
          activities: [
            activity("evt-1", "2026-09-03T01:00:00.000Z", {
              data: {
                item: {
                  type: "mcpToolCall",
                  status: "completed",
                  server: "persist",
                  tool: "mailbox_send",
                  arguments: { from: "t3-developer" },
                },
              },
            }),
          ],
        },
        {
          id: ThreadId.make("newer-thread"),
          activities: [
            activity("evt-2", "2026-09-03T02:00:00.000Z", {
              data: {
                item: {
                  type: "mcpToolCall",
                  status: "completed",
                  server: "persist-v3",
                  tool: "abilities_execute",
                  arguments: {
                    name: "mailbox.send",
                    arguments: { body: { from: "t3-developer" } },
                  },
                },
              },
            }),
          ],
        },
      ],
      new Set(["t3-developer"]),
    );

    expect(routes.get("t3-developer")).toBe(ThreadId.make("newer-thread"));
  });

  it("supports completed Claude tool activities and rejects incomplete or unknown agents", () => {
    const routes = discoverPersistThreadRoutes(
      [
        {
          id: ThreadId.make("claude-thread"),
          activities: [
            activity(
              "evt-1",
              "2026-09-03T02:00:00.000Z",
              {
                itemType: "mcpToolCall",
                data: {
                  toolName: "mcp__persist__mailbox_send",
                  input: { from: "fleet-agent" },
                },
              },
              "tool.completed",
            ),
            activity("evt-2", "2026-09-03T03:00:00.000Z", {
              data: {
                item: {
                  type: "mcpToolCall",
                  status: "started",
                  server: "persist",
                  tool: "mailbox_send",
                  arguments: { from: "fleet-agent" },
                },
              },
            }),
            activity("evt-3", "2026-09-03T04:00:00.000Z", {
              data: {
                item: {
                  type: "mcpToolCall",
                  status: "completed",
                  server: "persist",
                  tool: "mailbox_send",
                  arguments: { from: "unknown-agent" },
                },
              },
            }),
          ],
        },
      ],
      new Set(["fleet-agent"]),
    );

    expect([...routes]).toEqual([["fleet-agent", ThreadId.make("claude-thread")]]);
  });
});
