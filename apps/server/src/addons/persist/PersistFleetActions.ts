import {
  ServerAddonActionError,
  type PersistFleetAgentRegistrationInput,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";

import { resolvePersistToken } from "./PersistFleetClient.ts";

const DEFAULT_DAEMON_URL = "http://127.0.0.1:8803";

function actionError(message: string) {
  return new ServerAddonActionError({
    addonId: "persist",
    actionId: "fleet.agent.upsert",
    message,
  });
}

function requestJson(method: "GET" | "POST" | "PUT", url: string, token: string, body?: unknown) {
  return Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const base =
      method === "GET"
        ? HttpClientRequest.get(url)
        : method === "POST"
          ? HttpClientRequest.post(url)
          : HttpClientRequest.put(url);
    const authenticated = base.pipe(
      HttpClientRequest.acceptJson,
      HttpClientRequest.bearerToken(token),
    );
    const request =
      body === undefined
        ? authenticated
        : authenticated.pipe(HttpClientRequest.bodyJsonUnsafe(body));
    const response = yield* client.execute(request).pipe(
      Effect.mapError(() => actionError("PERSIST is unavailable.")),
      Effect.timeoutOption(5_000),
      Effect.flatMap((result) =>
        result._tag === "None"
          ? Effect.fail(actionError("PERSIST request timed out."))
          : Effect.succeed(result.value),
      ),
    );
    const payload = yield* response.json.pipe(
      Effect.mapError(() => actionError(`PERSIST returned invalid JSON for ${method} ${url}.`)),
    );
    if (response.status < 200 || response.status >= 300) {
      return yield* actionError(`PERSIST rejected ${method} ${url} with HTTP ${response.status}.`);
    }
    return payload;
  });
}

export function registerPersistFleetAgent(input: PersistFleetAgentRegistrationInput) {
  return Effect.gen(function* () {
    const token = yield* resolvePersistToken;
    if (token === null) return yield* actionError("PERSIST authentication is unavailable.");
    const daemonUrl = (process.env.PERSIST_URL ?? DEFAULT_DAEMON_URL).replace(/\/$/, "");

    yield* requestJson(
      "PUT",
      `${daemonUrl}/api/v1/fleet/agents/${encodeURIComponent(input.agentId)}`,
      token,
      {
        display_name: input.displayName,
        role: input.role,
        parent_agent_id: input.parentAgentId,
        project_key: input.boardSlugs[0] ?? null,
        authority: [],
        skills: [],
        lifecycle: "active",
        actor_agent_id: input.agentId,
      },
    );

    for (const slug of input.boardSlugs) {
      const listed = yield* requestJson(
        "GET",
        `${daemonUrl}/api/v1/boards?slug=${encodeURIComponent(slug)}`,
        token,
      );
      const boards =
        typeof listed === "object" && listed !== null && "boards" in listed
          ? (listed as { boards?: unknown }).boards
          : null;
      const board = Array.isArray(boards) ? boards[0] : null;
      const boardId =
        typeof board === "object" && board !== null && "id" in board && typeof board.id === "string"
          ? board.id
          : null;
      if (boardId === null) return yield* actionError(`PERSIST board not found: ${slug}.`);
      yield* requestJson(
        "POST",
        `${daemonUrl}/api/v1/boards/${encodeURIComponent(boardId)}/members`,
        token,
        { agent_id: input.agentId, role: "member" },
      );
    }

    return { agentId: input.agentId, joinedBoards: input.boardSlugs };
  });
}
