import * as Schema from "effect/Schema";

import { IsoDateTime, NonNegativeInt, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";

/**
 * T3's versioned read model for the PERSIST fleet sidebar.
 *
 * Identity and hierarchy are explicit facts supplied by PERSIST. Consumers
 * must not derive `role` or `parentAgentId` from handles, titles, or prompts.
 */
export const PERSIST_FLEET_CONTRACT_VERSION = 2 as const;

export const PersistFleetRole = Schema.Literals([
  "commander",
  "orchestrator",
  "product",
  "team_member",
  "coordinator",
]);
export type PersistFleetRole = typeof PersistFleetRole.Type;

export const PersistFleetLifecycle = Schema.Literals(["active", "settled", "retired"]);
export type PersistFleetLifecycle = typeof PersistFleetLifecycle.Type;

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

export const PersistFleetBoardRole = Schema.Literals(["lead", "co_lead", "member", "observer"]);
export type PersistFleetBoardRole = typeof PersistFleetBoardRole.Type;

export const PersistFleetBoard = Schema.Struct({
  boardId: TrimmedNonEmptyString,
  slug: TrimmedNonEmptyString,
  title: TrimmedNonEmptyString,
  url: TrimmedNonEmptyString,
  membershipRole: Schema.NullOr(PersistFleetBoardRole),
  /** All non-terminal board items: proposed + accepted + in progress. */
  openItems: Schema.NullOr(NonNegativeInt),
  readyItems: Schema.NullOr(NonNegativeInt),
  activeItems: Schema.NullOr(NonNegativeInt),
  triageItems: Schema.NullOr(NonNegativeInt),
});
export type PersistFleetBoard = typeof PersistFleetBoard.Type;

export const PersistFleetAgent = Schema.Struct({
  agentId: TrimmedNonEmptyString,
  displayName: TrimmedNonEmptyString,
  /** Null until PERSIST has stamped a durable role. Never infer it in T3. */
  role: Schema.NullOr(PersistFleetRole),
  /** Null until PERSIST has stamped durable parentage. Never infer it in T3. */
  parentAgentId: Schema.NullOr(TrimmedNonEmptyString),
  projectKey: Schema.NullOr(TrimmedNonEmptyString),
  authority: Schema.Array(TrimmedNonEmptyString),
  skills: Schema.Array(TrimmedNonEmptyString),
  lifecycle: Schema.NullOr(PersistFleetLifecycle),
  /** The currently resolved T3 route; route bindings themselves are not cached here. */
  threadId: Schema.NullOr(ThreadId),
  mailbox: PersistFleetMailbox,
  work: PersistFleetWork,
  boards: Schema.Array(PersistFleetBoard),
});
export type PersistFleetAgent = typeof PersistFleetAgent.Type;

export const PersistFleetSnapshot = Schema.Struct({
  contractVersion: Schema.Literal(PERSIST_FLEET_CONTRACT_VERSION),
  generatedAt: IsoDateTime,
  unknownFields: Schema.Struct({
    role: Schema.NullOr(TrimmedNonEmptyString),
    parentAgentId: Schema.NullOr(TrimmedNonEmptyString),
  }),
  agents: Schema.Array(PersistFleetAgent),
});
export type PersistFleetSnapshot = typeof PersistFleetSnapshot.Type;

/** Wire response owned by PERSIST's read-only `fleet.list` ability. */
export const PersistFleetApiResponse = Schema.Struct({
  count: NonNegativeInt,
  agents: Schema.Array(
    Schema.Struct({
      agent_id: TrimmedNonEmptyString,
      presence: Schema.Struct({
        state: PersistFleetMailboxState,
        last_read_at: Schema.NullOr(IsoDateTime),
      }),
      work: Schema.Struct({
        tasks_running: NonNegativeInt,
        tasks_pending: NonNegativeInt,
        is_busy: Schema.Boolean,
      }),
      boards: Schema.Struct({
        slugs: Schema.Array(TrimmedNonEmptyString),
        claims: NonNegativeInt,
        claims_lapsed: NonNegativeInt,
        items_completed: NonNegativeInt,
      }),
      display_name: TrimmedNonEmptyString,
      role: Schema.NullOr(PersistFleetRole),
      parent_agent_id: Schema.NullOr(TrimmedNonEmptyString),
      project_key: Schema.NullOr(TrimmedNonEmptyString),
      authority: Schema.Array(TrimmedNonEmptyString),
      skills: Schema.Array(TrimmedNonEmptyString),
      lifecycle: Schema.NullOr(PersistFleetLifecycle),
    }),
  ),
  unknown_fields: Schema.Struct({
    role: Schema.NullOr(TrimmedNonEmptyString),
    parent_agent_id: Schema.NullOr(TrimmedNonEmptyString),
  }),
});
export type PersistFleetApiResponse = typeof PersistFleetApiResponse.Type;

/** Existing PERSIST board-detail response composed into the fleet read model. */
export const PersistBoardsApiResponse = Schema.Struct({
  boards: Schema.Array(
    Schema.Struct({
      id: TrimmedNonEmptyString,
      slug: TrimmedNonEmptyString,
      title: TrimmedNonEmptyString,
      members: Schema.Array(
        Schema.Struct({
          agentId: TrimmedNonEmptyString,
          role: PersistFleetBoardRole,
        }),
      ),
      items_by_state: Schema.Record(TrimmedNonEmptyString, NonNegativeInt),
    }),
  ),
});
export type PersistBoardsApiResponse = typeof PersistBoardsApiResponse.Type;

export const PersistFleetAgentRegistrationInput = Schema.Struct({
  agentId: TrimmedNonEmptyString,
  displayName: TrimmedNonEmptyString,
  role: PersistFleetRole,
  parentAgentId: Schema.NullOr(TrimmedNonEmptyString),
  boardSlugs: Schema.Array(TrimmedNonEmptyString),
});
export type PersistFleetAgentRegistrationInput = typeof PersistFleetAgentRegistrationInput.Type;

export class PersistFleetUnavailableError extends Schema.TaggedErrorClass<PersistFleetUnavailableError>()(
  "PersistFleetUnavailableError",
  { message: TrimmedNonEmptyString },
) {}
