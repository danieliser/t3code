import { ThreadId, type PersistFleetApiResponse } from "@t3tools/contracts";
import { it as effectIt } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  attachPersistThreadRoutes,
  projectPersistFleetSnapshot,
  readPersistFleet,
} from "./PersistFleetClient.ts";

const response = (overrides: Partial<PersistFleetApiResponse> = {}): PersistFleetApiResponse => ({
  count: 1,
  agents: [
    {
      agent_id: "t3-developer",
      presence: { state: "online", last_read_at: "2026-09-02T23:04:31.000Z" },
      work: { tasks_running: 0, tasks_pending: 2, is_busy: false },
      boards: { slugs: ["popup-maker-growth"], claims: 19, claims_lapsed: 7, items_completed: 8 },
      display_name: "T3 Developer",
      role: null,
      parent_agent_id: null,
      project_key: "popup-maker-growth",
      authority: ["fleet:manage"],
      skills: ["persist-board"],
      lifecycle: "active",
    },
  ],
  unknown_fields: {
    role: "not recorded",
    parent_agent_id: "not recorded",
  },
  ...overrides,
});

describe("projectPersistFleetSnapshot", () => {
  it("preserves unknown identity fields and maps event totals without inference", () => {
    const snapshot = projectPersistFleetSnapshot(response(), {
      generatedAt: "2026-09-02T23:05:00.000Z",
      webUrl: "http://127.0.0.1:5173/",
      boardBySlug: new Map([
        [
          "popup-maker-growth",
          {
            id: "board-growth",
            slug: "popup-maker-growth",
            title: "Popup Maker Growth & Product",
            members: [{ agentId: "t3-developer", role: "co_lead" }],
            items_by_state: { accepted: 8, in_progress: 2, proposed: 1, done: 12 },
          },
        ],
      ]),
    });

    expect(snapshot.unknownFields).toEqual({ role: "not recorded", parentAgentId: "not recorded" });
    expect(snapshot.agents[0]).toMatchObject({
      agentId: "t3-developer",
      displayName: "T3 Developer",
      role: null,
      parentAgentId: null,
      projectKey: "popup-maker-growth",
      authority: ["fleet:manage"],
      skills: ["persist-board"],
      lifecycle: "active",
      threadId: null,
      work: { state: "idle_waiting", activeTasks: 0, waitingTasks: 2, blockedTasks: null },
      boards: [
        {
          boardId: "board-growth",
          title: "Popup Maker Growth & Product",
          membershipRole: "co_lead",
          openItems: 11,
          readyItems: 8,
          activeItems: 2,
          triageItems: 1,
          url: "http://127.0.0.1:5173/boards/popup-maker-growth",
        },
      ],
    });
  });

  it("reports running work but leaves no-work agents unknown", () => {
    const running = response({
      agents: [
        {
          ...response().agents[0]!,
          work: { tasks_running: 1, tasks_pending: 0, is_busy: true },
        },
        {
          ...response().agents[0]!,
          agent_id: "quiet-agent",
          work: { tasks_running: 0, tasks_pending: 0, is_busy: false },
        },
      ],
      count: 2,
    });
    const snapshot = projectPersistFleetSnapshot(running, {
      generatedAt: "2026-09-02T23:05:00.000Z",
    });
    expect(snapshot.agents.map((agent) => agent.work.state)).toEqual(["active", "unknown"]);
  });

  it("treats omitted sparse board-state counts as zero when board detail is available", () => {
    const snapshot = projectPersistFleetSnapshot(response(), {
      generatedAt: "2026-09-02T23:05:00.000Z",
      boardBySlug: new Map([
        [
          "popup-maker-growth",
          {
            id: "board-growth",
            slug: "popup-maker-growth",
            title: "Popup Maker Growth & Product",
            members: [{ agentId: "t3-developer", role: "lead" }],
            items_by_state: { accepted: 10, done: 2 },
          },
        ],
      ]),
    });

    expect(snapshot.agents[0]?.boards[0]).toMatchObject({
      openItems: 10,
      readyItems: 10,
      activeItems: 0,
      triageItems: 0,
    });
  });
});

describe("attachPersistThreadRoutes", () => {
  it("binds only explicitly discovered live routes", () => {
    const snapshot = projectPersistFleetSnapshot(response(), {
      generatedAt: "2026-09-03T00:00:00.000Z",
    });
    const routed = attachPersistThreadRoutes(
      snapshot,
      new Map([["t3-developer", ThreadId.make("thread-live")]]),
    );

    expect(routed.agents[0]?.threadId).toBe("thread-live");
  });
});

effectIt.effect("reads the authenticated live fleet without returning the bearer token", () =>
  Effect.gen(function* () {
    vi.stubEnv("PERSIST_AUTH_TOKEN", "test-owner-token");
    vi.stubEnv("PERSIST_URL", "http://persist.test:8803");
    let authorization: string | undefined;
    const httpLayer = Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((request) => {
        authorization = request.headers.authorization;
        const payload = request.url.includes("/api/v1/boards?")
          ? {
              boards: [
                {
                  id: "board-growth",
                  slug: "popup-maker-growth",
                  title: "Popup Maker Growth & Product",
                  members: [{ agentId: "t3-developer", role: "lead" }],
                  items_by_state: { accepted: 4, in_progress: 1, proposed: 2 },
                },
              ],
            }
          : response();
        return Effect.succeed(HttpClientResponse.fromWeb(request, Response.json(payload)));
      }),
    );

    const snapshot = yield* readPersistFleet({}).pipe(
      Effect.provide(Layer.merge(httpLayer, FileSystem.layerNoop({}))),
      Effect.ensuring(Effect.sync(() => vi.unstubAllEnvs())),
    );

    expect(authorization).toBe("Bearer test-owner-token");
    expect(snapshot.agents[0]?.agentId).toBe("t3-developer");
    expect(snapshot.agents[0]?.boards[0]).toMatchObject({
      membershipRole: "lead",
      openItems: 7,
      readyItems: 4,
      activeItems: 1,
      triageItems: 2,
    });
    expect(snapshot).not.toHaveProperty("token");
  }),
);
