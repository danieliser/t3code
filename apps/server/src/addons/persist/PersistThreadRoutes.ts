import type { OrchestrationThread, ThreadId } from "@t3tools/contracts";

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonempty(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function normalized(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
}

function isPersistServer(value: unknown): boolean {
  return ["persist", "persistv3"].includes(normalized(value));
}

function isPersistToolName(value: unknown): boolean {
  const name = normalized(value);
  return name.startsWith("mcppersist") || name.startsWith("persist");
}

function mailboxSendArgsFromExecute(
  input: Record<string, unknown>,
): Record<string, unknown> | null {
  if (normalized(input.name) !== "mailboxsend") return null;
  const args = record(input.arguments);
  if (args === null) return null;
  return record(args.body) ?? args;
}

function completedMailboxSendArgs(activity: unknown): Record<string, unknown> | null {
  const activityRecord = record(activity);
  const payload = record(activityRecord?.payload);
  const data = record(payload?.data);
  if (activityRecord === null || payload === null || data === null) return null;

  const item = record(data.item);
  const codexArgs = record(item?.arguments);
  if (
    item !== null &&
    codexArgs !== null &&
    item.type === "mcpToolCall" &&
    item.status === "completed" &&
    isPersistServer(item.server)
  ) {
    if (normalized(item.tool) === "mailboxsend") return codexArgs;
    if (normalized(item.tool) === "abilitiesexecute") {
      return mailboxSendArgsFromExecute(codexArgs);
    }
  }

  const claudeArgs = record(data.input);
  if (
    claudeArgs !== null &&
    normalized(activityRecord.kind) === "toolcompleted" &&
    normalized(payload.itemType) === "mcptoolcall" &&
    isPersistToolName(data.toolName)
  ) {
    const toolName = normalized(data.toolName);
    if (toolName.endsWith("mailboxsend")) return claudeArgs;
    if (toolName.endsWith("abilitiesexecute")) {
      return mailboxSendArgsFromExecute(claudeArgs);
    }
  }
  return null;
}

/**
 * Resolve ephemeral PERSIST agent routes from completed mailbox sends in T3's
 * authoritative thread projection. Nothing is persisted or inferred from an
 * agent name: a daemon restart simply recomputes the same live projection.
 */
export function discoverPersistThreadRoutes(
  threads: ReadonlyArray<Pick<OrchestrationThread, "id" | "activities">>,
  knownAgentIds: ReadonlySet<string>,
): ReadonlyMap<string, ThreadId> {
  return new Map(
    [...discoverPersistThreadRouteRecords(threads, knownAgentIds)].map(([agentId, route]) => [
      agentId,
      route.threadId,
    ]),
  );
}

export interface PersistThreadRouteRecord {
  readonly threadId: ThreadId;
  readonly discoveredAt: number;
}

export function discoverPersistThreadRouteRecords(
  threads: ReadonlyArray<Pick<OrchestrationThread, "id" | "activities">>,
  knownAgentIds: ReadonlySet<string>,
): ReadonlyMap<string, PersistThreadRouteRecord> {
  const latest = new Map<string, PersistThreadRouteRecord>();

  for (const thread of threads) {
    for (const activity of thread.activities) {
      const args = completedMailboxSendArgs(activity);
      const agentId = nonempty(args?.from);
      if (agentId === null || !knownAgentIds.has(agentId)) continue;

      const createdAt = Date.parse(activity.createdAt);
      if (!Number.isFinite(createdAt)) continue;
      const current = latest.get(agentId);
      if (current === undefined || createdAt > current.discoveredAt) {
        latest.set(agentId, { threadId: thread.id, discoveredAt: createdAt });
      }
    }
  }

  return latest;
}
