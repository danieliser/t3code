import { PersistFleetAgentRegistrationInput } from "@t3tools/contracts";
import { it as effectIt } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";
import { describe, expect, vi } from "vite-plus/test";

import { registerPersistFleetAgent } from "./PersistFleetActions.ts";

const decodeJson = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown));

const input = PersistFleetAgentRegistrationInput.make({
  agentId: "growth-writer",
  displayName: "Growth Writer",
  role: "team_member",
  parentAgentId: "growth-orchestrator",
  boardSlugs: ["popup-maker-growth"],
});

describe("registerPersistFleetAgent", () => {
  effectIt.effect("registers identity first and then joins configured boards", () =>
    Effect.gen(function* () {
      vi.stubEnv("PERSIST_AUTH_TOKEN", "owner-token");
      vi.stubEnv("PERSIST_URL", "http://persist.test:8803");
      const requests: Array<{ method: string; url: string; body: unknown }> = [];
      const httpLayer = Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make((request) =>
          Effect.sync(() => {
            requests.push({
              method: request.method,
              url: request.url,
              body:
                request.body._tag === "Uint8Array"
                  ? decodeJson(new TextDecoder().decode(request.body.body))
                  : null,
            });
            const body = request.url.includes("/api/v1/boards?")
              ? { boards: [{ id: "board-1", slug: "popup-maker-growth" }] }
              : request.url.endsWith("/members")
                ? { role: "member", lead_claimed: false }
                : { agent: { agent_id: input.agentId } };
            return HttpClientResponse.fromWeb(request, Response.json(body));
          }),
        ),
      );

      const result = yield* registerPersistFleetAgent(input).pipe(
        Effect.provide(Layer.merge(httpLayer, FileSystem.layerNoop({}))),
        Effect.ensuring(Effect.sync(() => vi.unstubAllEnvs())),
      );
      expect(result).toEqual({ agentId: "growth-writer", joinedBoards: ["popup-maker-growth"] });
      expect(requests.map(({ method, url }) => [method, url])).toEqual([
        ["PUT", "http://persist.test:8803/api/v1/fleet/agents/growth-writer"],
        ["GET", "http://persist.test:8803/api/v1/boards?slug=popup-maker-growth"],
        ["POST", "http://persist.test:8803/api/v1/boards/board-1/members"],
      ]);
      expect(requests[0]?.body).toMatchObject({
        display_name: "Growth Writer",
        role: "team_member",
        parent_agent_id: "growth-orchestrator",
        lifecycle: "active",
        actor_agent_id: "growth-writer",
      });
    }),
  );
});
