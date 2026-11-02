import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_SIDEBAR_THREAD_FILTERS } from "@t3tools/contracts/settings";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { makeThreadFixture } from "../test-fixtures";
import {
  filterSidebarThreadsForActiveRoute,
  matchesSidebarThreadFilters,
  partitionSidebarProjectsByHiddenState,
  updateSidebarHiddenProjectKeys,
} from "./Sidebar.logic";

const environmentId = EnvironmentId.make("environment-local");
const projectId = ProjectId.make("project-test");
const now = "2026-11-02T00:00:00.000Z";
const thread = () =>
  makeThreadFixture({ environmentId, projectId, createdAt: now, updatedAt: now });

describe("custom Alpha sidebar filters", () => {
  it("keeps the active route visible when its filters do not match", () => {
    const threads = [{ key: "open" }, { key: "other" }];
    expect(
      filterSidebarThreadsForActiveRoute({
        threads,
        activeThreadKey: "open",
        getThreadKey: (value) => value.key,
        matchesFilters: () => false,
      }),
    ).toEqual([threads[0]]);
  });
  it("filters by recent activity, environment and archived state", () => {
    const item = thread();
    const input = {
      thread: item,
      providerDriverKind: null,
      filters: { ...DEFAULT_SIDEBAR_THREAD_FILTERS, recentOnly: true },
      nowMs: Date.parse(now),
    };
    expect(matchesSidebarThreadFilters(input)).toBe(true);
    expect(matchesSidebarThreadFilters({ ...input, nowMs: Date.parse(now) + 8 * 86400000 })).toBe(
      false,
    );
    expect(
      matchesSidebarThreadFilters({
        ...input,
        filters: { ...input.filters, environmentIds: [EnvironmentId.make("another")] },
      }),
    ).toBe(false);
    expect(matchesSidebarThreadFilters({ ...input, thread: { ...item, archivedAt: now } })).toBe(
      false,
    );
    expect(
      matchesSidebarThreadFilters({
        ...input,
        thread: { ...item, archivedAt: now },
        filters: { ...input.filters, includeArchived: true },
      }),
    ).toBe(true);
  });
  it.each([
    { pendingSubagentRequest: "approval" as const },
    { pendingSubagentRequest: "user_input" as const },
    { pendingGuestMessageCount: 1 },
  ])("keeps delegated and guest requests in attention filters: %o", (overrides) => {
    expect(
      matchesSidebarThreadFilters({
        thread: { ...thread(), ...overrides },
        providerDriverKind: null,
        filters: { ...DEFAULT_SIDEBAR_THREAD_FILTERS, attentionOnly: true },
      }),
    ).toBe(true);
  });
  it("restores hidden projects while their chats run", () => {
    const project = {
      title: "Project",
      projectKey: `${environmentId}:${projectId}`,
      id: projectId,
      environmentId,
      memberProjectRefs: [{ environmentId, projectId }],
    };
    const hiddenProjectKeys = [`${environmentId}:${projectId}`];
    const partition = (status: string | null) =>
      partitionSidebarProjectsByHiddenState({
        projects: [project],
        threads: [{ ...thread(), runtime: status === null ? null : { status } }],
        hiddenProjectKeys,
      });
    expect(partition(null).hiddenProjects).toEqual([project]);
    expect(partition("running").visibleProjects).toEqual([project]);
    expect(
      updateSidebarHiddenProjectKeys({
        hiddenProjectKeys,
        projectRefs: project.memberProjectRefs,
        hidden: false,
      }),
    ).toEqual([]);
  });
});
