import * as Schema from "effect/Schema";

import { IsoDateTime, NonNegativeInt, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";

/**
 * T3's versioned read model for the PERSIST fleet sidebar.
 *
 * Identity and hierarchy are explicit facts supplied by PERSIST. Consumers
 * must not derive `role` or `parentAgentId` from handles, titles, or prompts.
 */
export const PERSIST_FLEET_CONTRACT_VERSION = 1 as const;

export const PersistFleetRole = Schema.Literals([
  "commander",
  "orchestrator",
  "product",
  "team_member",
  "coordinator",
]);
export type PersistFleetRole = typeof PersistFleetRole.Type;

export const PersistFleetMailboxState = Schema.Literals([
  "online",
  "idle",
  "offline",
  "never_seen",
]);
export type PersistFleetMailboxState = typeof PersistFleetMailboxState.Type;

export const PersistFleetWorkState = Schema.Literals([
  "active",
  "idle_waiting",
  "blocked",
  "unknown",
]);
export type PersistFleetWorkState = typeof PersistFleetWorkState.Type;

export const PersistFleetMailbox = Schema.Struct({
  state: PersistFleetMailboxState,
  lastReadAt: Schema.NullOr(IsoDateTime),
  lastSignalKind: Schema.NullOr(TrimmedNonEmptyString),
});
export type PersistFleetMailbox = typeof PersistFleetMailbox.Type;

export const PersistFleetWork = Schema.Struct({
  state: PersistFleetWorkState,
  activeTasks: Schema.NullOr(NonNegativeInt),
  waitingTasks: Schema.NullOr(NonNegativeInt),
  blockedTasks: Schema.NullOr(NonNegativeInt),
});
export type PersistFleetWork = typeof PersistFleetWork.Type;

export const PersistFleetSessionStats = Schema.Struct({
  /** Claim-event count, not the expiring current board assignee column. */
  claimedItems: Schema.NullOr(NonNegativeInt),
  completedItems: Schema.NullOr(NonNegativeInt),
});
export type PersistFleetSessionStats = typeof PersistFleetSessionStats.Type;

export const PersistFleetBoard = Schema.Struct({
  boardId: TrimmedNonEmptyString,
  slug: TrimmedNonEmptyString,
  title: TrimmedNonEmptyString,
  url: TrimmedNonEmptyString,
  assignedItems: Schema.NullOr(NonNegativeInt),
  completedItems: Schema.NullOr(NonNegativeInt),
});
export type PersistFleetBoard = typeof PersistFleetBoard.Type;

export const PersistFleetAgent = Schema.Struct({
  agentId: TrimmedNonEmptyString,
  displayName: TrimmedNonEmptyString,
  /** Null until PERSIST has stamped a durable role. Never infer it in T3. */
  role: Schema.NullOr(PersistFleetRole),
  /** Null until PERSIST has stamped durable parentage. Never infer it in T3. */
  parentAgentId: Schema.NullOr(TrimmedNonEmptyString),
  /** The currently resolved T3 route; route bindings themselves are not cached here. */
  threadId: Schema.NullOr(ThreadId),
  mailbox: PersistFleetMailbox,
  work: PersistFleetWork,
  session: PersistFleetSessionStats,
  boards: Schema.Array(PersistFleetBoard),
});
export type PersistFleetAgent = typeof PersistFleetAgent.Type;

export const PersistFleetSnapshot = Schema.Struct({
  contractVersion: Schema.Literal(PERSIST_FLEET_CONTRACT_VERSION),
  generatedAt: IsoDateTime,
  agents: Schema.Array(PersistFleetAgent),
});
export type PersistFleetSnapshot = typeof PersistFleetSnapshot.Type;
