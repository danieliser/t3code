import { WsRpcGroup } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { RpcClient } from "effect/rpc";

export const makeWsRpcProtocolClient = RpcClient.make(WsRpcGroup);
type RpcClientFactory = typeof makeWsRpcProtocolClient;
export type WsRpcProtocolClient =
  RpcClientFactory extends Effect.Effect<infer Client, any, any> ? Client : never;

// Keep idle RPC connections alive with one ping per minute. The 15 second
// no-frame threshold is checked on each ping tick.
export const PING_INTERVAL = "60 seconds";
export const PING_TIMEOUT = "15 seconds";
