import type { PersistFleetRole } from "@t3tools/contracts";

export interface PersistNewChatDraftConfig {
  readonly enabled: boolean;
  readonly agentId: string;
  readonly displayName: string;
  readonly role: PersistFleetRole;
  readonly parentAgentId: string | null;
  readonly boardSlugsText: string;
}

export interface PersistNewChatConfig extends Omit<PersistNewChatDraftConfig, "boardSlugsText"> {
  readonly boardSlugs: readonly string[];
}

export const DEFAULT_PERSIST_NEW_CHAT_CONFIG: PersistNewChatDraftConfig = {
  enabled: false,
  agentId: "",
  displayName: "",
  role: "product",
  parentAgentId: null,
  boardSlugsText: "",
};

export function persistRoleAllowsParent(role: PersistFleetRole): boolean {
  return role === "orchestrator" || role === "team_member";
}

export function persistParentRoleAllowed(
  role: PersistFleetRole,
  parentRole: PersistFleetRole | null,
): boolean {
  if (role === "orchestrator") return parentRole === "commander";
  if (role === "team_member") {
    return (
      parentRole === "commander" || parentRole === "orchestrator" || parentRole === "coordinator"
    );
  }
  return false;
}

export function parsePersistBoardSlugs(value: string): readonly string[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((slug) => slug.trim())
        .filter((slug) => slug.length > 0),
    ),
  );
}

export function normalizePersistAgentId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function resolvePersistNewChatConfig(
  draft: PersistNewChatDraftConfig,
): PersistNewChatConfig {
  return {
    enabled: draft.enabled,
    agentId: normalizePersistAgentId(draft.agentId),
    displayName: draft.displayName.trim(),
    role: draft.role,
    parentAgentId: persistRoleAllowsParent(draft.role) ? draft.parentAgentId?.trim() || null : null,
    boardSlugs: parsePersistBoardSlugs(draft.boardSlugsText),
  };
}

export function persistNewChatConfigIssue(config: PersistNewChatDraftConfig): string | null {
  if (!config.enabled) return null;
  if (normalizePersistAgentId(config.agentId).length === 0) return "Agent ID is required";
  if (config.displayName.trim().length === 0) return "Display name is required";
  if (config.role === "team_member" && !config.parentAgentId?.trim()) {
    return "Choose a parent orchestrator";
  }
  return null;
}
