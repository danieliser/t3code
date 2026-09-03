import { describe, expect, it } from "vite-plus/test";

import { isPersistFleetInvalidationMessage, persistWebSocketUrl } from "./PersistFleetEvents.ts";

describe("persistWebSocketUrl", () => {
  it("derives local and TLS websocket endpoints", () => {
    expect(persistWebSocketUrl("http://127.0.0.1:8803")).toBe("ws://127.0.0.1:8803/ws");
    expect(persistWebSocketUrl("https://persist.example.test/base/")).toBe(
      "wss://persist.example.test/base/ws",
    );
  });
});

describe("isPersistFleetInvalidationMessage", () => {
  it("accepts subscription and event frames only", () => {
    expect(isPersistFleetInvalidationMessage({ type: "subscribed" })).toBe(true);
    expect(isPersistFleetInvalidationMessage({ type: "event", event_id: "8" })).toBe(true);
    expect(isPersistFleetInvalidationMessage({ type: "pong" })).toBe(false);
    expect(isPersistFleetInvalidationMessage("event")).toBe(false);
  });
});
