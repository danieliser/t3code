import {
  EventId,
  MessageId,
  ThreadId,
  type OrchestrationMessage,
  type OrchestrationThreadActivity,
} from "@t3tools/contracts";
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

const message = (
  id: string,
  createdAt: string,
  text: string,
  role: OrchestrationMessage["role"] = "user",
): OrchestrationMessage => ({
  id: MessageId.make(id),
  role,
  text,
  turnId: null,
  streaming: false,
  createdAt: createdAt as OrchestrationMessage["createdAt"],
  updatedAt: createdAt as OrchestrationMessage["updatedAt"],
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

  it("resolves inbound-only role chats from canonical PERSIST pages", () => {
    const routes = discoverPersistThreadRoutes(
      [
        {
          id: ThreadId.make("persist-role-chat"),
          activities: [],
          messages: [
            message(
              "message-1",
              "2026-09-03T09:04:51.814Z",
              [
                "PERSIST-Page: 2",
                'From-Agent: "review-agent"',
                'To-Mailbox: "t3-developer"',
                'Topic: "review-ready"',
                "Channel: null",
                'Message-ID: "559"',
                'Sent-At: "2026-09-03T09:04:43.000Z"',
                'Body-Format: "untrusted-json-string"',
                "",
                '"Review is ready."',
              ].join("\n"),
            ),
          ],
        },
      ],
      new Set(["t3-developer"]),
    );

    expect(routes.get("t3-developer")).toBe(ThreadId.make("persist-role-chat"));
  });

  it("rejects page-like prose, assistant messages, and unknown mailboxes", () => {
    const canonicalPage = (mailbox: string) =>
      [
        "PERSIST-Page: 2",
        'From-Agent: "review-agent"',
        `To-Mailbox: "${mailbox}"`,
        'Message-ID: "559"',
        'Sent-At: "2026-09-03T09:04:43.000Z"',
        "",
        '"Review is ready."',
      ].join("\n");
    const routes = discoverPersistThreadRoutes(
      [
        {
          id: ThreadId.make("not-a-route"),
          activities: [],
          messages: [
            message(
              "message-1",
              "2026-09-03T09:04:51.814Z",
              canonicalPage("t3-developer"),
              "assistant",
            ),
            message(
              "message-2",
              "2026-09-03T09:04:52.814Z",
              'Someone mentioned To-Mailbox: "t3-developer" in prose.',
            ),
            message("message-3", "2026-09-03T09:04:53.814Z", canonicalPage("unknown-agent")),
          ],
        },
      ],
      new Set(["t3-developer"]),
    );

    expect(routes.size).toBe(0);
  });
});
