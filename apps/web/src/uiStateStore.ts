import { Debouncer } from "@tanstack/react-pacer";
import type { PullRequestMergeMethod } from "@t3tools/contracts";
import { create } from "zustand";
import { normalizeProjectPathForComparison } from "@t3tools/client-runtime/state/projects";
import {
  createAppRendererStateStorage,
  readRendererStateWithRetries,
} from "./rendererStateStorage";
import {
  createThreadLabelId,
  normalizeThreadLabelColor,
  normalizeThreadLabelName,
  sanitizeThreadLabels,
  type ThreadLabel,
} from "./threadLabels";

export const PERSISTED_STATE_KEY = "t3code:ui-state:v1";
const THREAD_CHANGED_FILES_EXPANSION_VERSION = 2;
const LEGACY_PERSISTED_STATE_KEYS = [
  "t3code:renderer-state:v8",
  "t3code:renderer-state:v7",
  "t3code:renderer-state:v6",
  "t3code:renderer-state:v5",
  "t3code:renderer-state:v4",
  "t3code:renderer-state:v3",
  "codething:renderer-state:v4",
  "codething:renderer-state:v3",
  "codething:renderer-state:v2",
  "codething:renderer-state:v1",
] as const;
const uiStateStorage = createAppRendererStateStorage("ui-state");
let uiStatePersistenceHydrated = !uiStateStorage.requiresExplicitHydration;
let uiStateHydrationPromise: Promise<void> | null = null;
let uiStateHydrationGeneration = 0;
let uiStateHydrationBaseline: UiState | null = null;
let uiStateDocumentInvalid = false;
let applyingUiStateHydration = false;

export interface PersistedUiState {
  projectExpandedById?: Record<string, boolean>;
  projectOrder?: string[];
  threadLastVisitedAtById?: Record<string, string>;
  collapsedProjectCwds?: string[];
  expandedProjectCwds?: string[];
  projectOrderCwds?: string[];
  defaultAdvertisedEndpointKey?: string | null;
  sidebarProjectScopeKey?: string | null;
  sidebarProjectScopeKeys?: string[];
  threadChangedFilesExpansionVersion?: number;
  threadChangedFilesExpandedById?: Record<string, Record<string, boolean>>;
  pullRequestMergeMethod?: string;
  threadLabels?: ThreadLabel[];
  threadLabelIdsByThreadKey?: Record<string, string[]>;
}

export interface UiProjectState {
  projectExpandedById: Record<string, boolean>;
  projectOrder: string[];
  sidebarProjectScopeKeys: string[];
}

export interface UiThreadState {
  threadLastVisitedAtById: Record<string, string>;
  threadChangedFilesExpandedById: Record<string, Record<string, boolean>>;
}

export interface UiThreadLabelState {
  threadLabels: ThreadLabel[];
  threadLabelIdsByThreadKey: Record<string, string[]>;
}

export interface UiEndpointState {
  defaultAdvertisedEndpointKey: string | null;
}

export interface UiPullRequestState {
  pullRequestMergeMethod: PullRequestMergeMethod;
}

export interface UiState
  extends UiProjectState, UiThreadState, UiThreadLabelState, UiEndpointState, UiPullRequestState {}

const initialState: UiState = {
  projectExpandedById: {},
  projectOrder: [],
  sidebarProjectScopeKeys: [],
  threadLastVisitedAtById: {},
  threadChangedFilesExpandedById: {},
  threadLabels: [],
  threadLabelIdsByThreadKey: {},
  defaultAdvertisedEndpointKey: null,
  pullRequestMergeMethod: "merge",
};

function snapshotUiState(state: UiState): UiState {
  return {
    projectExpandedById: { ...state.projectExpandedById },
    projectOrder: [...state.projectOrder],
    sidebarProjectScopeKeys: [...state.sidebarProjectScopeKeys],
    threadLastVisitedAtById: { ...state.threadLastVisitedAtById },
    threadChangedFilesExpandedById: Object.fromEntries(
      Object.entries(state.threadChangedFilesExpandedById).map(([threadId, turns]) => [
        threadId,
        { ...turns },
      ]),
    ),
    threadLabels: state.threadLabels.map((label) => ({ ...label })),
    threadLabelIdsByThreadKey: Object.fromEntries(
      Object.entries(state.threadLabelIdsByThreadKey).map(([threadKey, labelIds]) => [
        threadKey,
        [...labelIds],
      ]),
    ),
    defaultAdvertisedEndpointKey: state.defaultAdvertisedEndpointKey,
    pullRequestMergeMethod: state.pullRequestMergeMethod,
  };
}

function persistedValuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function reconcilePersistedRecord<T>(
  persisted: Readonly<Record<string, T>>,
  current: Readonly<Record<string, T>>,
  baseline: Readonly<Record<string, T>>,
): Record<string, T> {
  const reconciled: Record<string, T> = {};
  const keys = new Set([
    ...Object.keys(persisted),
    ...Object.keys(current),
    ...Object.keys(baseline),
  ]);
  for (const key of keys) {
    const currentHasKey = Object.hasOwn(current, key);
    const baselineHasKey = Object.hasOwn(baseline, key);
    const changedLocally =
      currentHasKey !== baselineHasKey ||
      (currentHasKey && !persistedValuesEqual(current[key], baseline[key]));
    if (changedLocally) {
      if (currentHasKey) {
        reconciled[key] = current[key] as T;
      }
      continue;
    }
    if (Object.hasOwn(persisted, key)) {
      reconciled[key] = persisted[key] as T;
    }
  }
  return reconciled;
}

function reconcileNestedPersistedRecord<T>(
  persisted: Readonly<Record<string, Readonly<Record<string, T>>>>,
  current: Readonly<Record<string, Readonly<Record<string, T>>>>,
  baseline: Readonly<Record<string, Readonly<Record<string, T>>>>,
): Record<string, Record<string, T>> {
  const reconciled: Record<string, Record<string, T>> = {};
  const keys = new Set([
    ...Object.keys(persisted),
    ...Object.keys(current),
    ...Object.keys(baseline),
  ]);
  for (const key of keys) {
    const currentHasKey = Object.hasOwn(current, key);
    const baselineHasKey = Object.hasOwn(baseline, key);
    if (currentHasKey !== baselineHasKey) {
      if (currentHasKey) {
        reconciled[key] = { ...(current[key] as Readonly<Record<string, T>>) };
      }
      continue;
    }
    if (!currentHasKey) {
      if (Object.hasOwn(persisted, key)) {
        reconciled[key] = { ...(persisted[key] as Readonly<Record<string, T>>) };
      }
      continue;
    }

    const reconciledNested = reconcilePersistedRecord(
      persisted[key] ?? {},
      current[key] as Readonly<Record<string, T>>,
      baseline[key] as Readonly<Record<string, T>>,
    );
    if (Object.keys(reconciledNested).length > 0) {
      reconciled[key] = reconciledNested;
    }
  }
  return reconciled;
}

function reconcileHydratedUiState(
  persisted: UiState,
  current: UiState,
  baseline: UiState,
): UiState {
  return {
    projectExpandedById: reconcilePersistedRecord(
      persisted.projectExpandedById,
      current.projectExpandedById,
      baseline.projectExpandedById,
    ),
    projectOrder: persistedValuesEqual(current.projectOrder, baseline.projectOrder)
      ? persisted.projectOrder
      : current.projectOrder,
    sidebarProjectScopeKeys: persistedValuesEqual(
      current.sidebarProjectScopeKeys,
      baseline.sidebarProjectScopeKeys,
    )
      ? persisted.sidebarProjectScopeKeys
      : current.sidebarProjectScopeKeys,
    threadLastVisitedAtById: reconcilePersistedRecord(
      persisted.threadLastVisitedAtById,
      current.threadLastVisitedAtById,
      baseline.threadLastVisitedAtById,
    ),
    threadChangedFilesExpandedById: reconcileNestedPersistedRecord(
      persisted.threadChangedFilesExpandedById,
      current.threadChangedFilesExpandedById,
      baseline.threadChangedFilesExpandedById,
    ),
    threadLabels: persistedValuesEqual(current.threadLabels, baseline.threadLabels)
      ? persisted.threadLabels
      : current.threadLabels,
    threadLabelIdsByThreadKey: reconcilePersistedRecord(
      persisted.threadLabelIdsByThreadKey,
      current.threadLabelIdsByThreadKey,
      baseline.threadLabelIdsByThreadKey,
    ),
    defaultAdvertisedEndpointKey:
      current.defaultAdvertisedEndpointKey === baseline.defaultAdvertisedEndpointKey
        ? persisted.defaultAdvertisedEndpointKey
        : current.defaultAdvertisedEndpointKey,
    pullRequestMergeMethod:
      current.pullRequestMergeMethod === baseline.pullRequestMergeMethod
        ? persisted.pullRequestMergeMethod
        : current.pullRequestMergeMethod,
  };
}

const LEGACY_PROJECT_CWD_PREFERENCE_PREFIX = "legacy-project-cwd:";
const LEGACY_PROJECT_EXPANSION_DEFAULT_KEY = "legacy-project-expansion-default";
let legacyKeysCleanedUp = false;

export function legacyProjectCwdPreferenceKey(cwd: string): string {
  return `${LEGACY_PROJECT_CWD_PREFERENCE_PREFIX}${normalizeProjectPathForComparison(cwd)}`;
}

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [
    ...new Set(
      value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0),
    ),
  ];
}

function sanitizeBooleanRecord(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object") {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, boolean] => entry[0].length > 0 && typeof entry[1] === "boolean",
    ),
  );
}

function sanitizeOptionalKey(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function sanitizeTimestampRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] =>
        entry[0].length > 0 &&
        typeof entry[1] === "string" &&
        entry[1].length > 0 &&
        Number.isFinite(Date.parse(entry[1])),
    ),
  );
}

function isPullRequestMergeMethod(value: unknown): value is PullRequestMergeMethod {
  return value === "merge" || value === "squash" || value === "rebase";
}

function sanitizeThreadLabelAssignments(
  value: unknown,
  labels: readonly ThreadLabel[],
): Record<string, string[]> {
  if (!value || typeof value !== "object") return {};
  const knownLabelIds = new Set(labels.map((label) => label.id));
  const assignments: Record<string, string[]> = {};
  for (const [threadKey, candidateIds] of Object.entries(value)) {
    if (!threadKey || !Array.isArray(candidateIds)) continue;
    const labelIds = [
      ...new Set(
        candidateIds.filter(
          (candidate): candidate is string =>
            typeof candidate === "string" && knownLabelIds.has(candidate),
        ),
      ),
    ];
    if (labelIds.length > 0) assignments[threadKey] = labelIds;
  }
  return assignments;
}

export function parsePersistedState(parsed: PersistedUiState): UiState {
  const projectExpandedById =
    parsed.projectExpandedById === undefined
      ? (() => {
          const migrated: Record<string, boolean> = {};
          const collapsedProjectCwds = sanitizeStringArray(parsed.collapsedProjectCwds);
          const expandedProjectCwds = sanitizeStringArray(parsed.expandedProjectCwds);
          for (const cwd of collapsedProjectCwds) {
            migrated[legacyProjectCwdPreferenceKey(cwd)] = false;
          }
          for (const cwd of expandedProjectCwds) {
            migrated[legacyProjectCwdPreferenceKey(cwd)] = true;
          }
          if (!Array.isArray(parsed.collapsedProjectCwds) && expandedProjectCwds.length > 0) {
            migrated[LEGACY_PROJECT_EXPANSION_DEFAULT_KEY] = false;
          }
          return migrated;
        })()
      : sanitizeBooleanRecord(parsed.projectExpandedById);
  const projectOrder =
    parsed.projectOrder === undefined
      ? sanitizeStringArray(parsed.projectOrderCwds).map(legacyProjectCwdPreferenceKey)
      : sanitizeStringArray(parsed.projectOrder);
  const threadLabels = sanitizeThreadLabels(parsed.threadLabels);

  return {
    projectExpandedById,
    projectOrder,
    threadLastVisitedAtById: sanitizeTimestampRecord(parsed.threadLastVisitedAtById),
    threadChangedFilesExpandedById:
      parsed.threadChangedFilesExpansionVersion === THREAD_CHANGED_FILES_EXPANSION_VERSION
        ? sanitizePersistedThreadChangedFilesExpanded(parsed.threadChangedFilesExpandedById)
        : {},
    threadLabels,
    threadLabelIdsByThreadKey: sanitizeThreadLabelAssignments(
      parsed.threadLabelIdsByThreadKey,
      threadLabels,
    ),
    defaultAdvertisedEndpointKey: sanitizeOptionalKey(parsed.defaultAdvertisedEndpointKey),
    sidebarProjectScopeKeys: sanitizeStringArray(
      parsed.sidebarProjectScopeKeys ?? [parsed.sidebarProjectScopeKey],
    ),
    pullRequestMergeMethod: isPullRequestMergeMethod(parsed.pullRequestMergeMethod)
      ? parsed.pullRequestMergeMethod
      : initialState.pullRequestMergeMethod,
  };
}

function parsePersistedStateJson(raw: string): UiState | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsePersistedState(parsed as PersistedUiState);
  } catch {
    return null;
  }
}

function readLegacyPersistedState(): { readonly raw: string; readonly state: UiState } | null {
  if (typeof window === "undefined") {
    return null;
  }
  for (const legacyKey of LEGACY_PERSISTED_STATE_KEYS) {
    let raw: string | null;
    try {
      raw = window.localStorage.getItem(legacyKey);
    } catch {
      return null;
    }
    if (!raw) {
      continue;
    }
    const state = parsePersistedStateJson(raw);
    if (state) {
      return { raw, state };
    }
  }
  return null;
}

function readPersistedState(): UiState {
  if (uiStateStorage.requiresExplicitHydration) {
    return initialState;
  }

  let raw: string | null | Promise<string | null>;
  try {
    raw = uiStateStorage.storage.getItem(PERSISTED_STATE_KEY);
  } catch {
    return initialState;
  }
  if (typeof raw === "string") {
    return parsePersistedStateJson(raw) ?? initialState;
  }

  return readLegacyPersistedState()?.state ?? initialState;
}

function sanitizePersistedThreadChangedFilesExpanded(
  value: PersistedUiState["threadChangedFilesExpandedById"],
): Record<string, Record<string, boolean>> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const nextState: Record<string, Record<string, boolean>> = {};
  for (const [threadId, turns] of Object.entries(value)) {
    if (!threadId || !turns || typeof turns !== "object") {
      continue;
    }

    const nextTurns: Record<string, boolean> = {};
    for (const [turnId, expanded] of Object.entries(turns)) {
      if (turnId && typeof expanded === "boolean") {
        nextTurns[turnId] = expanded;
      }
    }

    if (Object.keys(nextTurns).length > 0) {
      nextState[threadId] = nextTurns;
    }
  }

  return nextState;
}

function serializePersistedState(state: UiState): string {
  const projectExpandedById = Object.fromEntries(
    Object.entries(state.projectExpandedById).filter(
      ([key]) => key !== LEGACY_PROJECT_EXPANSION_DEFAULT_KEY,
    ),
  );
  return JSON.stringify({
    projectExpandedById,
    projectOrder: state.projectOrder,
    threadLastVisitedAtById: state.threadLastVisitedAtById,
    defaultAdvertisedEndpointKey: state.defaultAdvertisedEndpointKey,
    sidebarProjectScopeKeys: state.sidebarProjectScopeKeys,
    sidebarProjectScopeKey:
      state.sidebarProjectScopeKeys.length === 1
        ? (state.sidebarProjectScopeKeys[0] ?? null)
        : null,
    threadChangedFilesExpansionVersion: THREAD_CHANGED_FILES_EXPANSION_VERSION,
    threadChangedFilesExpandedById: state.threadChangedFilesExpandedById,
    pullRequestMergeMethod: state.pullRequestMergeMethod,
    threadLabels: state.threadLabels,
    threadLabelIdsByThreadKey: state.threadLabelIdsByThreadKey,
  } satisfies PersistedUiState);
}

function cleanUpLegacyPersistedStateKeys(): void {
  if (legacyKeysCleanedUp || typeof window === "undefined") {
    return;
  }
  for (const legacyKey of LEGACY_PERSISTED_STATE_KEYS) {
    try {
      window.localStorage.removeItem(legacyKey);
    } catch {
      return;
    }
  }
  legacyKeysCleanedUp = true;
}

export function persistState(state: UiState): void {
  try {
    const result = uiStateStorage.storage.setItem(
      PERSISTED_STATE_KEY,
      serializePersistedState(state),
    );
    void Promise.resolve(result).then(cleanUpLegacyPersistedStateKeys, () => undefined);
  } catch {
    // Ignore quota/storage errors to avoid breaking chat UX.
  }
}

const debouncedPersistState = new Debouncer(persistState, { wait: 500 });

export async function flushUiStatePersistence(): Promise<void> {
  debouncedPersistState.cancel();
  if (
    !uiStatePersistenceHydrated &&
    !uiStateDocumentInvalid &&
    uiStateStorage.requiresExplicitHydration
  ) {
    await hydrateUiStateStore();
  }
  if (!uiStatePersistenceHydrated || !uiStateStorage.writesEnabled()) {
    return;
  }
  await uiStateStorage.writeHydratedValue(
    PERSISTED_STATE_KEY,
    serializePersistedState(useUiStateStore.getState()),
  );
  cleanUpLegacyPersistedStateKeys();
}

export function markThreadVisited(state: UiState, threadId: string, visitedAt: string): UiState {
  const visitedAtMs = Date.parse(visitedAt);
  if (!Number.isFinite(visitedAtMs)) {
    return state;
  }
  const previousVisitedAt = state.threadLastVisitedAtById[threadId];
  const previousVisitedAtMs = previousVisitedAt ? Date.parse(previousVisitedAt) : NaN;
  if (
    Number.isFinite(previousVisitedAtMs) &&
    Number.isFinite(visitedAtMs) &&
    previousVisitedAtMs >= visitedAtMs
  ) {
    return state;
  }
  return {
    ...state,
    threadLastVisitedAtById: {
      ...state.threadLastVisitedAtById,
      [threadId]: visitedAt,
    },
  };
}

export function markThreadUnread(
  state: UiState,
  threadId: string,
  latestTurnCompletedAt: string | null | undefined,
): UiState {
  if (!latestTurnCompletedAt) {
    return state;
  }
  const latestTurnCompletedAtMs = Date.parse(latestTurnCompletedAt);
  if (Number.isNaN(latestTurnCompletedAtMs)) {
    return state;
  }
  const unreadVisitedAt = new Date(latestTurnCompletedAtMs - 1).toISOString();
  if (state.threadLastVisitedAtById[threadId] === unreadVisitedAt) {
    return state;
  }
  return {
    ...state,
    threadLastVisitedAtById: {
      ...state.threadLastVisitedAtById,
      [threadId]: unreadVisitedAt,
    },
  };
}

function setThreadChangedFilesExpanded(
  state: UiState,
  threadId: string,
  turnId: string,
  expanded: boolean,
): UiState {
  const currentThreadState = state.threadChangedFilesExpandedById[threadId] ?? {};
  if (currentThreadState[turnId] === expanded) {
    return state;
  }

  return {
    ...state,
    threadChangedFilesExpandedById: {
      ...state.threadChangedFilesExpandedById,
      [threadId]: {
        ...currentThreadState,
        [turnId]: expanded,
      },
    },
  };
}

function setDefaultAdvertisedEndpointKey(state: UiState, key: string | null): UiState {
  const nextKey = key && key.length > 0 ? key : null;
  if (state.defaultAdvertisedEndpointKey === nextKey) {
    return state;
  }
  return {
    ...state,
    defaultAdvertisedEndpointKey: nextKey,
  };
}

function setSidebarProjectScopeKeys(state: UiState, projectKeys: readonly string[]): UiState {
  const nextKeys = sanitizeStringArray(projectKeys);
  if (
    nextKeys.length === state.sidebarProjectScopeKeys.length &&
    nextKeys.every((key, index) => key === state.sidebarProjectScopeKeys[index])
  ) {
    return state;
  }
  return {
    ...state,
    sidebarProjectScopeKeys: nextKeys,
  };
}

function setPullRequestMergeMethod(state: UiState, method: PullRequestMergeMethod): UiState {
  return state.pullRequestMergeMethod === method
    ? state
    : { ...state, pullRequestMergeMethod: method };
}

function addThreadLabel(state: UiState, label: ThreadLabel): UiState {
  const id = label.id.trim();
  const name = normalizeThreadLabelName(label.name);
  const color = normalizeThreadLabelColor(label.color);
  if (!id || !name || !color) {
    return state;
  }
  const normalizedName = name.toLocaleLowerCase();
  if (
    state.threadLabels.some(
      (existing) => existing.id === id || existing.name.toLocaleLowerCase() === normalizedName,
    )
  ) {
    return state;
  }
  return {
    ...state,
    threadLabels: [...state.threadLabels, { id, name, color }],
  };
}

function updateThreadLabel(state: UiState, labelId: string, name: string, color: string): UiState {
  const labelIndex = state.threadLabels.findIndex((label) => label.id === labelId);
  const normalizedName = normalizeThreadLabelName(name);
  const normalizedColor = normalizeThreadLabelColor(color);
  if (labelIndex < 0 || !normalizedName || !normalizedColor) {
    return state;
  }
  const duplicateName = state.threadLabels.some(
    (label) =>
      label.id !== labelId && label.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase(),
  );
  if (duplicateName) {
    return state;
  }
  const currentLabel = state.threadLabels[labelIndex]!;
  if (currentLabel.name === normalizedName && currentLabel.color === normalizedColor) {
    return state;
  }
  const threadLabels = [...state.threadLabels];
  threadLabels[labelIndex] = {
    ...currentLabel,
    name: normalizedName,
    color: normalizedColor,
  };
  return {
    ...state,
    threadLabels,
  };
}

function deleteThreadLabel(state: UiState, labelId: string): UiState {
  if (!state.threadLabels.some((label) => label.id === labelId)) {
    return state;
  }
  const threadLabelIdsByThreadKey: Record<string, string[]> = {};
  for (const [threadKey, labelIds] of Object.entries(state.threadLabelIdsByThreadKey)) {
    const nextLabelIds = labelIds.filter((candidate) => candidate !== labelId);
    if (nextLabelIds.length > 0) {
      threadLabelIdsByThreadKey[threadKey] = nextLabelIds;
    }
  }
  return {
    ...state,
    threadLabels: state.threadLabels.filter((label) => label.id !== labelId),
    threadLabelIdsByThreadKey,
  };
}

function setThreadLabelAssigned(
  state: UiState,
  threadKeys: string | readonly string[],
  labelId: string,
  assigned: boolean,
): UiState {
  if (!state.threadLabels.some((label) => label.id === labelId)) {
    return state;
  }
  const keys = [
    ...new Set((typeof threadKeys === "string" ? [threadKeys] : threadKeys).filter(Boolean)),
  ];
  if (keys.length === 0) {
    return state;
  }

  let changed = false;
  const threadLabelIdsByThreadKey = { ...state.threadLabelIdsByThreadKey };
  for (const threadKey of keys) {
    const currentIds = threadLabelIdsByThreadKey[threadKey] ?? [];
    const currentlyAssigned = currentIds.includes(labelId);
    if (currentlyAssigned === assigned) {
      continue;
    }
    changed = true;
    if (assigned) {
      threadLabelIdsByThreadKey[threadKey] = [...currentIds, labelId];
      continue;
    }
    const nextIds = currentIds.filter((candidate) => candidate !== labelId);
    if (nextIds.length === 0) {
      delete threadLabelIdsByThreadKey[threadKey];
    } else {
      threadLabelIdsByThreadKey[threadKey] = nextIds;
    }
  }
  return changed ? { ...state, threadLabelIdsByThreadKey } : state;
}

export function resolveProjectExpanded(
  projectExpandedById: Readonly<Record<string, boolean>>,
  preferenceKeys: readonly string[],
): boolean {
  for (const key of preferenceKeys) {
    const expanded = projectExpandedById[key];
    if (expanded !== undefined) {
      return expanded;
    }
  }
  return projectExpandedById[LEGACY_PROJECT_EXPANSION_DEFAULT_KEY] ?? true;
}

export function setProjectExpanded(
  state: UiState,
  projectIds: string | readonly string[],
  expanded: boolean,
): UiState {
  const ids = typeof projectIds === "string" ? [projectIds] : projectIds;
  const nextEntries = ids.filter((projectId) => state.projectExpandedById[projectId] !== expanded);
  if (nextEntries.length === 0) {
    return state;
  }
  const projectExpandedById = { ...state.projectExpandedById };
  for (const projectId of nextEntries) {
    projectExpandedById[projectId] = expanded;
  }
  return {
    ...state,
    projectExpandedById,
  };
}

export function reorderProjects(
  state: UiState,
  currentProjectOrder: readonly string[],
  draggedProjectIds: readonly string[],
  targetProjectIds: readonly string[],
): UiState {
  if (draggedProjectIds.length === 0) {
    return state;
  }
  const draggedSet = new Set(draggedProjectIds);
  const targetSet = new Set(targetProjectIds);
  if (draggedProjectIds.every((id) => targetSet.has(id))) {
    return state;
  }

  const originalTargetIndex = currentProjectOrder.findIndex((id) => targetSet.has(id));
  if (originalTargetIndex < 0) {
    return state;
  }

  const projectOrder = [...currentProjectOrder];

  const removed: string[] = [];
  let draggedBeforeTarget = 0;
  for (let i = projectOrder.length - 1; i >= 0; i--) {
    if (draggedSet.has(projectOrder[i]!)) {
      removed.unshift(projectOrder.splice(i, 1)[0]!);
      if (i < originalTargetIndex) {
        draggedBeforeTarget++;
      }
    }
  }
  if (removed.length === 0) {
    return state;
  }

  const insertIndex = originalTargetIndex - Math.max(0, draggedBeforeTarget - 1);
  projectOrder.splice(insertIndex, 0, ...removed);
  return {
    ...state,
    projectOrder,
  };
}

interface UiStateStore extends UiState {
  markThreadVisited: (threadId: string, visitedAt: string) => void;
  markThreadUnread: (threadId: string, latestTurnCompletedAt: string | null | undefined) => void;
  setThreadChangedFilesExpanded: (threadId: string, turnId: string, expanded: boolean) => void;
  setDefaultAdvertisedEndpointKey: (key: string | null) => void;
  setSidebarProjectScopeKeys: (projectKeys: readonly string[]) => void;
  setPullRequestMergeMethod: (method: PullRequestMergeMethod) => void;
  createThreadLabel: (name: string, color: string) => string | null;
  updateThreadLabel: (labelId: string, name: string, color: string) => boolean;
  deleteThreadLabel: (labelId: string) => void;
  setThreadLabelAssigned: (
    threadKeys: string | readonly string[],
    labelId: string,
    assigned: boolean,
  ) => void;
  setProjectExpanded: (projectIds: string | readonly string[], expanded: boolean) => void;
  reorderProjects: (
    currentProjectOrder: readonly string[],
    draggedProjectIds: readonly string[],
    targetProjectIds: readonly string[],
  ) => void;
}

export const useUiStateStore = create<UiStateStore>((set, get) => ({
  ...readPersistedState(),
  markThreadVisited: (threadId, visitedAt) =>
    set((state) => markThreadVisited(state, threadId, visitedAt)),
  markThreadUnread: (threadId, latestTurnCompletedAt) =>
    set((state) => markThreadUnread(state, threadId, latestTurnCompletedAt)),
  setThreadChangedFilesExpanded: (threadId, turnId, expanded) =>
    set((state) => setThreadChangedFilesExpanded(state, threadId, turnId, expanded)),
  setDefaultAdvertisedEndpointKey: (key) =>
    set((state) => setDefaultAdvertisedEndpointKey(state, key)),
  setSidebarProjectScopeKeys: (projectKeys) =>
    set((state) => setSidebarProjectScopeKeys(state, projectKeys)),
  setPullRequestMergeMethod: (method) => set((state) => setPullRequestMergeMethod(state, method)),
  createThreadLabel: (name, color) => {
    const normalizedName = normalizeThreadLabelName(name);
    const normalizedColor = normalizeThreadLabelColor(color);
    if (!normalizedName || !normalizedColor) {
      return null;
    }
    const existing = get().threadLabels.find(
      (label) => label.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase(),
    );
    if (existing) {
      return existing.id;
    }
    const id = createThreadLabelId();
    set((state) => addThreadLabel(state, { id, name: normalizedName, color: normalizedColor }));
    return id;
  },
  updateThreadLabel: (labelId, name, color) => {
    const currentState = get();
    const nextState = updateThreadLabel(currentState, labelId, name, color);
    if (nextState === currentState) {
      return false;
    }
    set(nextState);
    return true;
  },
  deleteThreadLabel: (labelId) => set((state) => deleteThreadLabel(state, labelId)),
  setThreadLabelAssigned: (threadKeys, labelId, assigned) =>
    set((state) => setThreadLabelAssigned(state, threadKeys, labelId, assigned)),
  setProjectExpanded: (projectIds, expanded) =>
    set((state) => setProjectExpanded(state, projectIds, expanded)),
  reorderProjects: (currentProjectOrder, draggedProjectIds, targetProjectIds) =>
    set((state) =>
      reorderProjects(state, currentProjectOrder, draggedProjectIds, targetProjectIds),
    ),
}));

export function continueUiStatePersistenceHydrationInBackground(): void {
  if (
    uiStatePersistenceHydrated ||
    uiStateDocumentInvalid ||
    !uiStateStorage.requiresExplicitHydration ||
    uiStateHydrationPromise !== null
  ) {
    return;
  }
  void hydrateUiStateStore();
}

export async function hydrateUiStateStore(): Promise<void> {
  if (
    uiStatePersistenceHydrated ||
    uiStateDocumentInvalid ||
    !uiStateStorage.requiresExplicitHydration
  ) {
    return;
  }
  if (uiStateHydrationPromise) {
    return uiStateHydrationPromise;
  }

  const hydrationGeneration = uiStateHydrationGeneration;
  const isCurrentHydration = () => hydrationGeneration === uiStateHydrationGeneration;
  uiStateHydrationBaseline ??= snapshotUiState(useUiStateStore.getState());
  const hydrationPromise = (async () => {
    try {
      const raw = await readRendererStateWithRetries(() =>
        uiStateStorage.storage.getItem(PERSISTED_STATE_KEY),
      );
      if (!isCurrentHydration()) {
        return;
      }
      let persistedState: UiState;
      let migratedLegacyState = false;
      if (raw !== null) {
        const parsedState = parsePersistedStateJson(raw);
        if (!parsedState) {
          uiStateDocumentInvalid = true;
          console.error(
            "[RENDERER_STATE] Desktop UI state document is not valid JSON state; preserving it without enabling writes.",
          );
          return;
        }
        persistedState = parsedState;
      } else {
        const legacyState = readLegacyPersistedState();
        persistedState = legacyState?.state ?? initialState;
        migratedLegacyState = legacyState !== null;
      }
      const baseline = uiStateHydrationBaseline ?? initialState;
      const current = snapshotUiState(useUiStateStore.getState());
      const hadLocalChanges = !persistedValuesEqual(current, baseline);
      const reconciledState = reconcileHydratedUiState(persistedState, current, baseline);
      applyingUiStateHydration = true;
      try {
        useUiStateStore.setState(reconciledState);
      } finally {
        applyingUiStateHydration = false;
      }
      if (!isCurrentHydration()) {
        return;
      }
      uiStateStorage.enableWrites();
      uiStatePersistenceHydrated = true;
      uiStateHydrationBaseline = null;
      if (migratedLegacyState || hadLocalChanges) {
        try {
          await uiStateStorage.writeHydratedValue(
            PERSISTED_STATE_KEY,
            serializePersistedState(reconciledState),
          );
          if (migratedLegacyState) {
            cleanUpLegacyPersistedStateKeys();
          }
        } catch (error) {
          console.error("[RENDERER_STATE] Reconciled UI state persistence failed.", error);
          debouncedPersistState.maybeExecute(reconciledState);
        }
      }
    } catch (error) {
      if (isCurrentHydration()) {
        console.error(
          "[RENDERER_STATE] UI state hydration failed after bounded retries; writes remain guarded until a later read succeeds.",
          error,
        );
      }
    }
  })().finally(() => {
    if (uiStateHydrationPromise === hydrationPromise) {
      uiStateHydrationPromise = null;
    }
  });
  uiStateHydrationPromise = hydrationPromise;
  return hydrationPromise;
}

useUiStateStore.subscribe((state) => {
  if (applyingUiStateHydration) {
    return;
  }
  if (uiStatePersistenceHydrated) {
    debouncedPersistState.maybeExecute(state);
    return;
  }
  if (!uiStateDocumentInvalid) {
    continueUiStatePersistenceHydrationInBackground();
  }
});

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("beforeunload", () => {
    void flushUiStatePersistence().catch((error) => {
      console.error("[RENDERER_STATE] UI state shutdown flush failed.", error);
    });
  });
}
