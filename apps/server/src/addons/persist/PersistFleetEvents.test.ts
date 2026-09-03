import { describe, expect, it } from "vite-plus/test";

import {
  isPersistFleetInvalidationMessage,
  PERSIST_FLEET_CHANNEL,
  persistWebSocketUrl,
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
