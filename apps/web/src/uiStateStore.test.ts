import { ProjectId, ThreadId } from "@t3tools/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  addThreadLabel,
  deleteThreadLabel,
  legacyProjectCwdPreferenceKey,
  markActiveThreadVisited,
  markThreadUnread,
  markThreadVisited,
  parsePersistedState,
  PERSISTED_STATE_KEY,
  type PersistedUiState,
  persistState,
  reorderProjects,
  resolveProjectExpanded,
  setDefaultAdvertisedEndpointKey,
  setProjectExpanded,
  setSidebarProjectScopeKey,
  setThreadLabelAssigned,
  setThreadChangedFilesExpanded,
  type UiState,
  updateThreadLabel,
} from "./uiStateStore";

function makeUiState(overrides: Partial<UiState> = {}): UiState {
  return {
    projectExpandedById: {},
    projectOrder: [],
    sidebarProjectScopeKey: null,
    threadLastVisitedAtById: {},
    threadExplicitlyUnreadById: {},
    threadChangedFilesExpandedById: {},
    hasTrackedActiveThreadRoute: false,
    activeThreadVisit: null,
    threadLabels: [],
    threadLabelIdsByThreadKey: {},
    defaultAdvertisedEndpointKey: null,
    ...overrides,
  };
}

describe("uiStateStore pure functions", () => {
  it("stores server timestamps without moving visit state backwards", () => {
    const threadId = ThreadId.make("thread-1");
    const initialState = makeUiState();
    const visited = markThreadVisited(initialState, threadId, "2026-02-25T12:30:00.700Z");

    expect(visited.threadLastVisitedAtById[threadId]).toBe("2026-02-25T12:30:00.700Z");
    expect(markThreadVisited(visited, threadId, "2026-02-25T12:30:00.000Z")).toBe(visited);
    expect(markThreadVisited(visited, threadId, "not-a-date")).toBe(visited);
  });

  it("marks any thread explicitly unread without requiring a completion timestamp", () => {
    const threadId = ThreadId.make("thread-1");
    const initialState = makeUiState({
      threadLastVisitedAtById: {
        [threadId]: "2026-02-25T12:35:00.000Z",
      },
    });

    const next = markThreadUnread(initialState, threadId, "2026-02-25T12:30:00.000Z");

    expect(next.threadExplicitlyUnreadById[threadId]).toBe(true);
    expect(next.threadLastVisitedAtById).toBe(initialState.threadLastVisitedAtById);
    expect(markThreadUnread(next, threadId, null)).toBe(next);
  });

  it("keeps an active thread unread until its route or update changes", () => {
    const threadId = ThreadId.make("thread-1");
    const otherThreadId = ThreadId.make("thread-2");
    const updatedAt = "2026-02-25T12:30:00.000Z";
    const active = markActiveThreadVisited(makeUiState(), threadId, updatedAt);
    const unread = markThreadUnread(active, threadId, null);

    expect(markActiveThreadVisited(unread, threadId, updatedAt)).toBe(unread);
    expect(unread.threadExplicitlyUnreadById[threadId]).toBe(true);

    const away = markActiveThreadVisited(unread, otherThreadId, null);
    const returned = markActiveThreadVisited(away, threadId, updatedAt);
    expect(returned.threadExplicitlyUnreadById[threadId]).toBeUndefined();
  });

  it("preserves persisted unread state through initial route hydration", () => {
    const threadId = ThreadId.make("thread-1");
    const updatedAt = "2026-02-25T12:30:00.000Z";
    const restarted = parsePersistedState({
      threadLastVisitedAtById: { [threadId]: updatedAt },
      threadExplicitlyUnreadById: { [threadId]: true },
    });

    const routed = markActiveThreadVisited(restarted, threadId, null);
    const hydrated = markActiveThreadVisited(routed, threadId, updatedAt);

    expect(routed.threadExplicitlyUnreadById[threadId]).toBe(true);
    expect(hydrated.threadExplicitlyUnreadById[threadId]).toBe(true);
    expect(hydrated.activeThreadVisit).toEqual({ threadId, visitedAt: updatedAt });
  });

  it("preserves active unread state through a transient detail gap", () => {
    const threadId = ThreadId.make("thread-1");
    const updatedAt = "2026-02-25T12:30:00.000Z";
    const active = markActiveThreadVisited(makeUiState(), threadId, updatedAt);
    const unread = markThreadUnread(active, threadId, null);

    const missing = markActiveThreadVisited(unread, threadId, null);
    const restored = markActiveThreadVisited(missing, threadId, updatedAt);

    expect(missing).toBe(unread);
    expect(restored).toBe(unread);
    expect(restored.threadExplicitlyUnreadById[threadId]).toBe(true);
  });

  it("clears explicit unread after leaving and returning to the same route", () => {
    const threadId = ThreadId.make("thread-1");
    const updatedAt = "2026-02-25T12:30:00.000Z";
    const active = markActiveThreadVisited(makeUiState(), threadId, updatedAt);
    const unread = markThreadUnread(active, threadId, null);

    const away = markActiveThreadVisited(unread, null, null);
    const returned = markActiveThreadVisited(away, threadId, updatedAt);

    expect(returned.threadExplicitlyUnreadById[threadId]).toBeUndefined();
  });

  it("clears explicit unread when the active thread updates", () => {
    const threadId = ThreadId.make("thread-1");
    const active = markActiveThreadVisited(makeUiState(), threadId, "2026-02-25T12:30:00.000Z");
    const unread = markThreadUnread(active, threadId, null);
    const updated = markActiveThreadVisited(unread, threadId, "2026-02-25T12:35:00.000Z");

    expect(updated.threadExplicitlyUnreadById[threadId]).toBeUndefined();
    expect(updated.threadLastVisitedAtById[threadId]).toBe("2026-02-25T12:35:00.000Z");
  });

  it("resolves project expansion from logical, physical, and legacy preference keys", () => {
    const physicalKey = "environment:/repo/project";
    const legacyKey = legacyProjectCwdPreferenceKey("/repo/project");

    expect(resolveProjectExpanded({ logical: false, [physicalKey]: true }, ["logical"])).toBe(
      false,
    );
    expect(resolveProjectExpanded({ [physicalKey]: false }, ["new-logical", physicalKey])).toBe(
      false,
    );
    expect(resolveProjectExpanded({ [legacyKey]: false }, ["new-logical", legacyKey])).toBe(false);
    expect(resolveProjectExpanded({}, ["new-logical"])).toBe(true);
  });

  it("sets expansion for every stable key belonging to a logical project", () => {
    const initialState = makeUiState();
    const keys = ["logical", "environment-a:/repo", "environment-b:/repo"];

    const next = setProjectExpanded(initialState, keys, false);

    expect(next.projectExpandedById).toEqual({
      logical: false,
      "environment-a:/repo": false,
      "environment-b:/repo": false,
    });
    expect(setProjectExpanded(next, keys, false)).toBe(next);
  });

  it("reorders from the current atom-derived project order", () => {
    const project1 = ProjectId.make("project-1");
    const project2 = ProjectId.make("project-2");
    const project3 = ProjectId.make("project-3");
    const currentOrder = [project1, project2, project3];

    const next = reorderProjects(makeUiState(), currentOrder, [project1], [project3]);

    expect(next.projectOrder).toEqual([project2, project3, project1]);
  });

  it("moves grouped project members together", () => {
    const keyALocal = "env-local:proj-a";
    const keyARemote = "env-remote:proj-a";
    const keyB = "env-local:proj-b";
    const keyC = "env-local:proj-c";
    const currentOrder = [keyALocal, keyARemote, keyB, keyC];

    const next = reorderProjects(makeUiState(), currentOrder, [keyALocal, keyARemote], [keyC]);

    expect(next.projectOrder).toEqual([keyB, keyC, keyALocal, keyARemote]);
  });

  it("does not reorder missing or identical groups", () => {
    const currentOrder = ["env-local:proj-a", "env-local:proj-b"];
    const state = makeUiState();

    expect(reorderProjects(state, currentOrder, ["env-local:missing"], ["env-local:proj-b"])).toBe(
      state,
    );
    expect(reorderProjects(state, currentOrder, ["env-local:proj-a"], ["env-local:proj-a"])).toBe(
      state,
    );
  });

  it("stores explicit changed-file expansion choices", () => {
    const threadId = ThreadId.make("thread-1");
    const collapsed = setThreadChangedFilesExpanded(makeUiState(), threadId, "turn-1", false);

    expect(collapsed.threadChangedFilesExpandedById).toEqual({
      [threadId]: {
        "turn-1": false,
      },
    });
    expect(
      setThreadChangedFilesExpanded(collapsed, threadId, "turn-1", true)
        .threadChangedFilesExpandedById,
    ).toEqual({
      [threadId]: {
        "turn-1": true,
      },
    });
  });

  it("stores the endpoint preference by stable key", () => {
    const next = setDefaultAdvertisedEndpointKey(makeUiState(), "desktop-core:lan:http");

    expect(next.defaultAdvertisedEndpointKey).toBe("desktop-core:lan:http");
    expect(setDefaultAdvertisedEndpointKey(next, "desktop-core:lan:http")).toBe(next);
    expect(setDefaultAdvertisedEndpointKey(next, "")).toMatchObject({
      defaultAdvertisedEndpointKey: null,
    });
  });

  it("stores the sidebar project scope and resets it to all projects", () => {
    const scoped = setSidebarProjectScopeKey(makeUiState(), "github.com/pingdotgg/t3code");

    expect(scoped.sidebarProjectScopeKey).toBe("github.com/pingdotgg/t3code");
    expect(setSidebarProjectScopeKey(scoped, "github.com/pingdotgg/t3code")).toBe(scoped);
    expect(setSidebarProjectScopeKey(scoped, null).sidebarProjectScopeKey).toBeNull();
    expect(setSidebarProjectScopeKey(scoped, "").sidebarProjectScopeKey).toBeNull();
  });

  it("creates reusable labels and assigns them to multiple scoped threads", () => {
    const label = { id: "label-research", name: "  Research  ", color: "#2563EB" };
    const withLabel = addThreadLabel(makeUiState(), label);
    const assigned = setThreadLabelAssigned(
      withLabel,
      ["environment-a:thread-1", "environment-b:thread-1"],
      "label-research",
      true,
    );

    expect(assigned.threadLabels).toEqual([
      { id: "label-research", name: "Research", color: "#2563eb" },
    ]);
    expect(assigned.threadLabelIdsByThreadKey).toEqual({
      "environment-a:thread-1": ["label-research"],
      "environment-b:thread-1": ["label-research"],
    });
    expect(
      setThreadLabelAssigned(assigned, "environment-a:thread-1", "label-research", false)
        .threadLabelIdsByThreadKey,
    ).toEqual({
      "environment-b:thread-1": ["label-research"],
    });
  });

  it("rejects invalid or duplicate labels and unknown assignments", () => {
    const state = addThreadLabel(makeUiState(), {
      id: "label-research",
      name: "Research",
      color: "#2563eb",
    });

    expect(
      addThreadLabel(state, {
        id: "label-duplicate",
        name: "research",
        color: "#16a34a",
      }),
    ).toBe(state);
    expect(
      addThreadLabel(state, {
        id: "label-invalid",
        name: "Invalid",
        color: "blue",
      }),
    ).toBe(state);
    expect(setThreadLabelAssigned(state, "environment:thread-1", "missing", true)).toBe(state);
  });

  it("renames and recolors an existing label without changing its assignments", () => {
    const assigned = setThreadLabelAssigned(
      addThreadLabel(makeUiState(), {
        id: "label-research",
        name: "Research",
        color: "#2563eb",
      }),
      "environment:thread-1",
      "label-research",
      true,
    );

    const updated = updateThreadLabel(assigned, "label-research", "  Deep research  ", "#16A34A");

    expect(updated.threadLabels).toEqual([
      { id: "label-research", name: "Deep research", color: "#16a34a" },
    ]);
    expect(updated.threadLabelIdsByThreadKey).toEqual(assigned.threadLabelIdsByThreadKey);
  });

  it("rejects invalid or duplicate label updates", () => {
    const withLabels = addThreadLabel(
      addThreadLabel(makeUiState(), {
        id: "label-research",
        name: "Research",
        color: "#2563eb",
      }),
      {
        id: "label-review",
        name: "Review",
        color: "#16a34a",
      },
    );

    expect(updateThreadLabel(withLabels, "label-review", "research", "#dc2626")).toBe(withLabels);
    expect(updateThreadLabel(withLabels, "label-review", "Review", "red")).toBe(withLabels);
    expect(updateThreadLabel(withLabels, "missing", "Review", "#dc2626")).toBe(withLabels);
  });

  it("deletes a label and removes it from every thread assignment", () => {
    const withLabels = addThreadLabel(
      addThreadLabel(makeUiState(), {
        id: "label-research",
        name: "Research",
        color: "#2563eb",
      }),
      {
        id: "label-review",
        name: "Review",
        color: "#16a34a",
      },
    );
    const assigned = setThreadLabelAssigned(
      setThreadLabelAssigned(
        setThreadLabelAssigned(withLabels, "environment:thread-1", "label-research", true),
        "environment:thread-1",
        "label-review",
        true,
      ),
      "environment:thread-2",
      "label-research",
      true,
    );

    const deleted = deleteThreadLabel(assigned, "label-research");

    expect(deleted.threadLabels).toEqual([
      { id: "label-review", name: "Review", color: "#16a34a" },
    ]);
    expect(deleted.threadLabelIdsByThreadKey).toEqual({
      "environment:thread-1": ["label-review"],
    });
    expect(deleteThreadLabel(deleted, "missing")).toBe(deleted);
  });
});

describe("parsePersistedState", () => {
  it("hydrates raw UI-owned state without server entities", () => {
    const parsed = parsePersistedState({
      projectExpandedById: {
        logical: false,
        invalid: "no" as unknown as boolean,
      },
      projectOrder: ["physical-b", "", "physical-a", "physical-b"],
      threadLastVisitedAtById: {
        "environment:thread-1": "2026-02-25T12:35:00.000Z",
        invalid: "not-a-date",
      },
      threadExplicitlyUnreadById: {
        "environment:thread-1": true,
        read: false,
      },
      defaultAdvertisedEndpointKey: "desktop-core:lan:http",
      threadChangedFilesExpansionVersion: 2,
      threadChangedFilesExpandedById: {
        "environment:thread-1": {
          "turn-1": false,
          "turn-2": true,
        },
      },
      threadLabels: [
        { id: "label-research", name: "Research", color: "#2563EB" },
        { id: "label-invalid", name: "Invalid", color: "blue" },
      ],
      threadLabelIdsByThreadKey: {
        "environment:thread-1": ["label-research", "label-research", "label-invalid"],
      },
    });

    expect(parsed).toEqual({
      projectExpandedById: {
        logical: false,
      },
      projectOrder: ["physical-b", "physical-a"],
      threadLastVisitedAtById: {
        "environment:thread-1": "2026-02-25T12:35:00.000Z",
      },
      threadExplicitlyUnreadById: {
        "environment:thread-1": true,
      },
      hasTrackedActiveThreadRoute: false,
      activeThreadVisit: null,
      defaultAdvertisedEndpointKey: "desktop-core:lan:http",
      sidebarProjectScopeKey: null,
      threadChangedFilesExpandedById: {
        "environment:thread-1": {
          "turn-1": false,
          "turn-2": true,
        },
      },
      threadLabels: [{ id: "label-research", name: "Research", color: "#2563eb" }],
      threadLabelIdsByThreadKey: {
        "environment:thread-1": ["label-research"],
      },
    });
  });

  it.each([undefined, 1])("ignores changed-file expansion version %s", (version) => {
    const parsed = parsePersistedState({
      ...(version === undefined ? {} : { threadChangedFilesExpansionVersion: version }),
      threadChangedFilesExpandedById: {
        "environment:thread-1": {
          "turn-1": false,
        },
      },
    });

    expect(parsed.threadChangedFilesExpandedById).toEqual({});
  });

  it("migrates legacy CWD project preferences into local alias keys", () => {
    const parsed = parsePersistedState({
      collapsedProjectCwds: ["/repo/b"],
      expandedProjectCwds: ["/repo/a"],
      projectOrderCwds: ["/repo/b", "/repo/a"],
    });
    const projectAKey = legacyProjectCwdPreferenceKey("/repo/a");
    const projectBKey = legacyProjectCwdPreferenceKey("/repo/b");

    expect(parsed.projectOrder).toEqual([projectBKey, projectAKey]);
    expect(resolveProjectExpanded(parsed.projectExpandedById, [projectAKey])).toBe(true);
    expect(resolveProjectExpanded(parsed.projectExpandedById, [projectBKey])).toBe(false);
    expect(resolveProjectExpanded(parsed.projectExpandedById, ["unknown"])).toBe(true);
  });

  it("preserves legacy expanded-only semantics for one-way migration", () => {
    const parsed = parsePersistedState({
      expandedProjectCwds: ["/repo/a"],
    });

    expect(
      resolveProjectExpanded(parsed.projectExpandedById, [
        legacyProjectCwdPreferenceKey("/repo/a"),
      ]),
    ).toBe(true);
    expect(
      resolveProjectExpanded(parsed.projectExpandedById, [
        legacyProjectCwdPreferenceKey("/repo/b"),
      ]),
    ).toBe(false);
  });
});

function createLocalStorageStub(): Storage {
  const store = new Map<string, string>();
  return {
    clear: () => {
      store.clear();
    },
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, value);
    },
  };
}

describe("uiStateStore persistence", () => {
  let localStorageStub: Storage;

  beforeEach(() => {
    localStorageStub = createLocalStorageStub();
    vi.stubGlobal("window", { localStorage: localStorageStub });
    vi.stubGlobal("localStorage", localStorageStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists raw UI preferences including thread visit markers", () => {
    const state = makeUiState({
      projectExpandedById: {
        logical: false,
      },
      projectOrder: ["physical-b", "physical-a"],
      threadLastVisitedAtById: {
        "environment:thread-1": "2026-02-25T12:35:00.000Z",
      },
      threadExplicitlyUnreadById: {
        "environment:thread-1": true,
      },
      threadChangedFilesExpandedById: {
        "environment:thread-1": {
          "turn-1": false,
          "turn-2": true,
        },
      },
      threadLabels: [{ id: "label-research", name: "Research", color: "#2563eb" }],
      threadLabelIdsByThreadKey: {
        "environment:thread-1": ["label-research"],
      },
      defaultAdvertisedEndpointKey: "desktop-core:lan:http",
    });

    persistState(state);

    const persisted = JSON.parse(
      localStorageStub.getItem(PERSISTED_STATE_KEY) ?? "{}",
    ) as PersistedUiState;
    expect(persisted).toEqual({
      projectExpandedById: {
        logical: false,
      },
      projectOrder: ["physical-b", "physical-a"],
      threadLastVisitedAtById: {
        "environment:thread-1": "2026-02-25T12:35:00.000Z",
      },
      threadExplicitlyUnreadById: {
        "environment:thread-1": true,
      },
      defaultAdvertisedEndpointKey: "desktop-core:lan:http",
      sidebarProjectScopeKey: null,
      threadChangedFilesExpansionVersion: 2,
      threadChangedFilesExpandedById: {
        "environment:thread-1": {
          "turn-1": false,
          "turn-2": true,
        },
      },
      threadLabels: [{ id: "label-research", name: "Research", color: "#2563eb" }],
      threadLabelIdsByThreadKey: {
        "environment:thread-1": ["label-research"],
      },
    });
    expect(parsePersistedState(persisted)).toEqual({
      ...state,
    });
  });

  it("restores the sidebar project scope across reloads", () => {
    persistState(makeUiState({ sidebarProjectScopeKey: "github.com/pingdotgg/t3code" }));

    const persisted = JSON.parse(
      localStorageStub.getItem(PERSISTED_STATE_KEY) ?? "{}",
    ) as PersistedUiState;

    expect(parsePersistedState(persisted).sidebarProjectScopeKey).toBe(
      "github.com/pingdotgg/t3code",
    );
  });

  it("drops the temporary expanded-only migration fallback when rewriting state", () => {
    const migrated = parsePersistedState({
      expandedProjectCwds: ["/repo/a"],
    });

    persistState(migrated);

    const persisted = JSON.parse(
      localStorageStub.getItem(PERSISTED_STATE_KEY) ?? "{}",
    ) as PersistedUiState;
    expect(resolveProjectExpanded(persisted.projectExpandedById ?? {}, ["unknown"])).toBe(true);
  });
});
