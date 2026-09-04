import {
  PERSIST_FLEET_CONTRACT_VERSION,
  PersistFleetApiResponse,
  type PersistFleetApiResponse as PersistFleetApiResponseValue,
  type PersistFleetSnapshot,
  PersistFleetUnavailableError,
  type ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";

const DEFAULT_DAEMON_URL = "http://127.0.0.1:8803";
const DEFAULT_WEB_URL = "http://127.0.0.1:5173";
const PERSIST_FLEET_READ_TIMEOUT_MS = 2_000;

function boardTitle(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function projectPersistFleetSnapshot(
  response: PersistFleetApiResponseValue,
  options: {
    readonly generatedAt: string;
    readonly webUrl?: string | undefined;
    readonly threadIdByAgentId?: ReadonlyMap<string, ThreadId> | undefined;
  },
): PersistFleetSnapshot {
  const webUrl = (options.webUrl ?? DEFAULT_WEB_URL).replace(/\/$/, "");
  return {
    contractVersion: PERSIST_FLEET_CONTRACT_VERSION,
    generatedAt: options.generatedAt as PersistFleetSnapshot["generatedAt"],
    unknownFields: {
      role: response.unknown_fields.role,
      parentAgentId: response.unknown_fields.parent_agent_id,
    },
    agents: response.agents.map((agent) => ({
      agentId: agent.agent_id,
      displayName: agent.display_name,
      role: agent.role,
      parentAgentId: agent.parent_agent_id,
      projectKey: agent.project_key,
      authority: agent.authority,
      skills: agent.skills,
      lifecycle: agent.lifecycle,
      // Routes are resolved from T3's live activity projection, never stored as
      // a second durable source of truth.
      threadId: options.threadIdByAgentId?.get(agent.agent_id) ?? null,
      mailbox: {
        state: agent.presence.state,
        lastReadAt: agent.presence.last_read_at,
        lastSignalKind: null,
      },
      work: {
        state:
          agent.work.tasks_running > 0 || agent.work.is_busy
            ? "active"
            : agent.work.tasks_pending > 0
              ? "idle_waiting"
              : "unknown",
        activeTasks: agent.work.tasks_running,
        waitingTasks: agent.work.tasks_pending,
        // The public read model has no blocked-task count yet.
        blockedTasks: null,
      },
      session: {
        claimedItems: agent.boards.claims,
        lapsedClaims: agent.boards.claims_lapsed,
        completedItems: agent.boards.items_completed,
      },
      boards: agent.boards.slugs.map((slug) => ({
        boardId: slug,
        slug,
        title: boardTitle(slug),
        url: `${webUrl}/boards/${encodeURIComponent(slug)}`,
        // The API currently supplies event totals per agent, not per board.
        assignedItems: null,
        completedItems: null,
      })),
    })),
  };
}

export function attachPersistThreadRoutes(
  snapshot: PersistFleetSnapshot,
  threadIdByAgentId: ReadonlyMap<string, ThreadId>,
): PersistFleetSnapshot {
  return {
    ...snapshot,
    agents: snapshot.agents.map((agent) => ({
      ...agent,
      threadId: threadIdByAgentId.get(agent.agentId) ?? null,
    })),
  };
}

export const resolvePersistToken = Effect.gen(function* () {
  const fromEnvironment = process.env.PERSIST_AUTH_TOKEN?.trim();
  if (fromEnvironment) return fromEnvironment;
  const tokenFile =
    process.env.PERSIST_V3_TOKEN_FILE ??
    `${process.env.HOME ?? ""}/.local/share/persist-v3/initial_token.txt`;
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* fileSystem.readFileString(tokenFile).pipe(
    Effect.map((value) => value.trim() || null),
    Effect.orElseSucceed(() => null),
  );
});

export function readPersistFleet(input: { readonly includeOffline?: boolean | undefined }) {
  return Effect.gen(function* () {
    const token = yield* resolvePersistToken;
    if (token === null) {
      return yield* new PersistFleetUnavailableError({
        message: "PERSIST authentication is unavailable.",
      });
    }
    const httpClient = yield* HttpClient.HttpClient;
    const daemonUrl = (process.env.PERSIST_URL ?? DEFAULT_DAEMON_URL).replace(/\/$/, "");
    const query = input.includeOffline === true ? "?include_offline=true" : "";
    const response = yield* httpClient
      .execute(
        HttpClientRequest.get(`${daemonUrl}/api/v1/fleet${query}`).pipe(
          HttpClientRequest.acceptJson,
          HttpClientRequest.bearerToken(token),
        ),
      )
      .pipe(
        Effect.mapError(
          () => new PersistFleetUnavailableError({ message: "PERSIST is unavailable." }),
        ),
        Effect.timeoutOption(PERSIST_FLEET_READ_TIMEOUT_MS),
        Effect.flatMap(
          Option.match({
            onNone: () =>
              new PersistFleetUnavailableError({ message: "PERSIST fleet read timed out." }),
            onSome: Effect.succeed,
          }),
        ),
      );
    if (response.status < 200 || response.status >= 300) {
      return yield* new PersistFleetUnavailableError({
        message: `PERSIST fleet read failed with HTTP ${response.status}.`,
      });
    }
    const decoded = yield* HttpClientResponse.schemaBodyJson(PersistFleetApiResponse)(
      response,
    ).pipe(
      Effect.mapError(
        () =>
          new PersistFleetUnavailableError({ message: "PERSIST returned an invalid fleet shape." }),
      ),
    );
    return projectPersistFleetSnapshot(decoded, {
      generatedAt: DateTime.formatIso(yield* DateTime.now),
      webUrl: process.env.PERSIST_WEB_URL,
    });
  });
}
