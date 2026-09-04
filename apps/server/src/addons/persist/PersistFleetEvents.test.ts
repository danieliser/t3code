import { it as effectIt } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vite-plus/test";

import {
  isPersistFleetInvalidationMessage,
  isPersistFleetRouteInvalidationEvent,
  PERSIST_FLEET_CHANNEL,
  persistWebSocketUrl,
  recoverPersistFleetStream,
} from "./PersistFleetEvents.ts";

describe("persistWebSocketUrl", () => {
  it("derives local and TLS websocket endpoints", () => {
    expect(persistWebSocketUrl("http://127.0.0.1:8803")).toBe("ws://127.0.0.1:8803/ws");
    expect(persistWebSocketUrl("https://persist.example.test/base/")).toBe(
      "wss://persist.example.test/base/ws",
    );
  });
});

describe("isPersistFleetInvalidationMessage", () => {
  it("accepts only fleet subscription and event frames", () => {
    expect(PERSIST_FLEET_CHANNEL).toBe("fleet");
    expect(isPersistFleetInvalidationMessage({ type: "subscribed", channel: "fleet" })).toBe(true);
    expect(
      isPersistFleetInvalidationMessage({
        type: "event",
        channel: "fleet",
        event: "task.updated",
        event_id: "8",
      }),
    ).toBe(true);
    expect(
      isPersistFleetInvalidationMessage({
        type: "event",
        channel: "audit",
        event: "http.request.completed",
        data: { path: "/api/v1/fleet" },
        event_id: "9",
      }),
    ).toBe(false);
    expect(isPersistFleetInvalidationMessage({ type: "pong" })).toBe(false);
    expect(isPersistFleetInvalidationMessage("event")).toBe(false);
  });
});

describe("isPersistFleetRouteInvalidationEvent", () => {
  it("accepts only durable thread events that can change route evidence", () => {
    expect(
      isPersistFleetRouteInvalidationEvent({
        type: "thread.activity-appended",
        payload: {
          activity: {
            kind: "item.completed",
            payload: {
              data: {
                item: {
                  type: "mcpToolCall",
                  status: "completed",
                  server: "persist",
                  tool: "mailbox_send",
                  arguments: { from: "fleet-agent" },
                },
              },
            },
          },
        },
      }),
    ).toBe(true);
    expect(
      isPersistFleetRouteInvalidationEvent({
        type: "thread.message-sent",
        payload: {
          role: "user",
          text: [
            "PERSIST-Page: 2",
            'To-Mailbox: "fleet-agent"',
            'Message-ID: "1"',
            'Sent-At: "2026-09-04T09:00:00.000Z"',
            "",
            '"Wake"',
          ].join("\n"),
        },
      }),
    ).toBe(true);
    expect(isPersistFleetRouteInvalidationEvent({ type: "thread.created" })).toBe(false);
    expect(
      isPersistFleetRouteInvalidationEvent({
        type: "thread.activity-appended",
        payload: { activity: { kind: "plan.updated", payload: {} } },
      }),
    ).toBe(false);
    expect(
      isPersistFleetRouteInvalidationEvent({
        type: "thread.message-sent",
        payload: { role: "assistant", text: "PERSIST-Page: 2" },
      }),
    ).toBe(false);
    expect(isPersistFleetRouteInvalidationEvent({ type: "thread.assistant-delta" })).toBe(false);
    expect(isPersistFleetRouteInvalidationEvent({ type: "thread.session-set" })).toBe(false);
    expect(isPersistFleetRouteInvalidationEvent(null)).toBe(false);
  });
});

describe("recoverPersistFleetStream", () => {
  effectIt.effect(
    "retries a failed initial read instead of permanently closing the subscription",
    () =>
      Effect.gen(function* () {
        let attempts = 0;
        const first = yield* Stream.fromEffect(
          Effect.suspend(() => {
            attempts += 1;
            return attempts === 1 ? Effect.fail("PERSIST unavailable") : Effect.succeed("ready");
          }),
        ).pipe((stream) => recoverPersistFleetStream(stream, Schedule.recurs(1)), Stream.runHead);

        expect(Option.getOrNull(first)).toBe("ready");
        expect(attempts).toBe(2);
      }),
  );
});
