// @effect-diagnostics globalTimers:off globalTimersInEffect:off globalDate:off -- The ws client owns reconnect/reconcile handles outside Effect scheduling and clears them in its Scope finalizer.
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import WebSocket from "ws";

import { resolvePersistToken } from "./PersistFleetClient.ts";
import { isPersistRouteActivity, persistMailboxFromPage } from "./PersistThreadRoutes.ts";

const DEFAULT_DAEMON_URL = "http://127.0.0.1:8803";
const RECONNECT_DELAY_MS = 1_000;
const RECONCILE_INTERVAL_MS = 30_000;
export const PERSIST_FLEET_CHANNEL = "fleet";

export function persistWebSocketUrl(daemonUrl: string): string {
  const url = new URL(daemonUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/$/, "")}/ws`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function isPersistFleetInvalidationMessage(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const message = value as Record<string, unknown>;
  return (
    (message.type === "event" || message.type === "subscribed") &&
    message.channel === PERSIST_FLEET_CHANNEL
  );
}

/**
 * T3's route projection is derived from its own thread events, so PERSIST's
 * fleet channel alone cannot make a newly established route visible in real
 * time. Invalidate for the small set of durable thread events that can add or
 * move route evidence; streaming deltas deliberately do not reach this path.
 */
export function isPersistFleetRouteInvalidationEvent(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  const payload =
    typeof event.payload === "object" && event.payload !== null && !Array.isArray(event.payload)
      ? (event.payload as Record<string, unknown>)
      : null;
  if (payload === null) return false;
  if (event.type === "thread.activity-appended") {
    return isPersistRouteActivity(payload.activity);
  }
  if (event.type === "thread.message-sent") {
    if (payload.role !== "user" || typeof payload.text !== "string") return false;
    return persistMailboxFromPage({ role: payload.role, text: payload.text }) !== null;
  }
  return false;
}

/**
 * Emits an invalidation immediately after every PERSIST connection/reconnect,
 * for each live event, and periodically as a reconciliation safety net. The
 * event stream is deliberately not treated as state: callers refetch the
 * authoritative fleet snapshot after every invalidation.
 */
export const persistFleetInvalidations = Stream.callback<number, never, FileSystem.FileSystem>(
  (queue) =>
    Effect.gen(function* () {
      const token = yield* resolvePersistToken;
      if (token === null) return;

      let stopped = false;
      let socket: WebSocket | null = null;
      let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
      const reconcileTimer = setInterval(() => {
        Queue.offerUnsafe(queue, Date.now());
      }, RECONCILE_INTERVAL_MS);

      const connect = () => {
        if (stopped) return;
        socket = new WebSocket(persistWebSocketUrl(process.env.PERSIST_URL ?? DEFAULT_DAEMON_URL), {
          headers: { Authorization: `Bearer ${token}` },
        });
        socket.on("open", () => {
          Queue.offerUnsafe(queue, Date.now());
          socket?.send(JSON.stringify({ type: "subscribe", channel: PERSIST_FLEET_CHANNEL }));
        });
        socket.on("message", (raw) => {
          try {
            if (isPersistFleetInvalidationMessage(JSON.parse(raw.toString()))) {
              Queue.offerUnsafe(queue, Date.now());
            }
          } catch {
            // Ignore malformed event frames; the periodic reconciliation still
            // converges to the authoritative HTTP snapshot.
          }
        });
        socket.on("error", () => {
          // `close` owns reconnect scheduling so one failure cannot fork loops.
        });
        socket.on("close", () => {
          socket = null;
          if (!stopped && reconnectTimer === null) {
            reconnectTimer = setTimeout(() => {
              reconnectTimer = null;
              connect();
            }, RECONNECT_DELAY_MS);
          }
        });
      };

      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          stopped = true;
          clearInterval(reconcileTimer);
          if (reconnectTimer !== null) clearTimeout(reconnectTimer);
          reconnectTimer = null;
          socket?.close(1000, "T3 PERSIST fleet subscription closed");
          socket = null;
        }),
      );
      connect();
    }),
).pipe(Stream.debounce("150 millis"));
