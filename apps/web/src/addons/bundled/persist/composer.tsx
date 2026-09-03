import { useAtomValue } from "@effect/atom-react";
import type { PersistFleetRole } from "@t3tools/contracts";
import { NetworkIcon } from "lucide-react";
import { useId, useMemo } from "react";

import { ComposerControl, ComposerControlIcon } from "../../../components/chat/ComposerControl";
import { Checkbox } from "../../../components/ui/checkbox";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import {
  Popover,
  PopoverDescription,
  PopoverPopup,
  PopoverTitle,
  PopoverTrigger,
} from "../../../components/ui/popover";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { primaryPersistFleetAtom } from "../../../state/server";
import { cn } from "../../../lib/utils";
import type {
  ComposerAddon,
  ComposerAddonContext,
  ComposerAddonContributionInput,
} from "../../composer";
import {
  DEFAULT_PERSIST_NEW_CHAT_CONFIG,
  normalizePersistAgentId,
  persistNewChatConfigIssue,
} from "./config";
import {
  clearPersistNewChatConfig,
  readPersistNewChatConfig,
  usePersistNewChatStore,
} from "./newChatStore";
import { commitPersistThreadBinding, usePersistBindingsStore } from "./bindingsStore";

const ROLE_OPTIONS = [
  ["product", "Product agent"],
  ["orchestrator", "Orchestrator"],
  ["team_member", "Team agent"],
  ["commander", "Fleet commander"],
  ["coordinator", "Coordinator"],
] as const satisfies ReadonlyArray<readonly [PersistFleetRole, string]>;

function roleLabel(role: PersistFleetRole): string {
  return ROLE_OPTIONS.find(([value]) => value === role)?.[1] ?? role;
}

function PersistNewChatControl(props: { readonly context: ComposerAddonContext }) {
  const { context } = props;
  const parentListId = useId();
  const config = usePersistNewChatStore(
    (state) => state.byTargetKey[context.targetKey] ?? DEFAULT_PERSIST_NEW_CHAT_CONFIG,
  );
  const setConfig = usePersistNewChatStore((state) => state.setConfig);
  const fleet = useAtomValue(primaryPersistFleetAtom);
  const bindings = usePersistBindingsStore((state) => state.byThreadId);
  const orchestrators = useMemo(
    () =>
      (fleet?.agents ?? [])
        .filter((agent) => agent.role === "orchestrator")
        .sort((left, right) => left.displayName.localeCompare(right.displayName)),
    [fleet],
  );
  const normalizedAgentId = normalizePersistAgentId(config.agentId);
  const routeAlreadyExists =
    normalizedAgentId !== "" &&
    ((fleet?.agents ?? []).some(
      (agent) => agent.agentId === normalizedAgentId && agent.threadId !== null,
    ) ||
      Object.values(bindings).some((binding) => binding.agentId === normalizedAgentId));
  const issue =
    persistNewChatConfigIssue(config) ??
    (routeAlreadyExists ? "This agent ID already has a T3 chat" : null);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <ComposerControl
            type="button"
            disabled={context.disabled}
            aria-label="Configure PERSIST agent"
            className={cn(
              "shrink-0",
              config.enabled && "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
            )}
          />
        }
      >
        <ComposerControlIcon icon={NetworkIcon} />
        <span>PERSIST</span>
        {config.enabled ? (
          <span
            aria-label={issue === null ? "PERSIST configuration ready" : issue}
            className={cn(
              "size-1.5 rounded-full",
              issue === null ? "bg-emerald-500" : "bg-amber-500",
            )}
          />
        ) : null}
      </PopoverTrigger>
      <PopoverPopup
        align="start"
        side="top"
        sideOffset={8}
        className="w-[min(24rem,calc(100vw-2rem))]"
        viewportClassName="space-y-4"
      >
        <div className="space-y-1">
          <PopoverTitle className="text-base">PERSIST agent</PopoverTitle>
          <PopoverDescription>
            Give this new chat a durable fleet identity. Identity, role, and parentage are always
            explicit.
          </PopoverDescription>
        </div>

        <Label className="cursor-pointer items-start gap-3 rounded-lg border border-border/70 p-3">
          <Checkbox
            className="mt-0.5"
            checked={config.enabled}
            onCheckedChange={(checked) =>
              setConfig(context.targetKey, { enabled: checked === true })
            }
          />
          <span className="min-w-0">
            <span className="block">Connect this chat to PERSIST</span>
            <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
              The binding is attached when the first message creates the chat; live status appears
              when the agent checks in with PERSIST.
            </span>
          </span>
        </Label>

        {config.enabled ? (
          <div className="space-y-3" data-persist-new-chat-fields="true">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${parentListId}-name`}>Display name</Label>
                <Input
                  id={`${parentListId}-name`}
                  value={config.displayName}
                  placeholder="Growth OS lead"
                  onValueChange={(displayName) => setConfig(context.targetKey, { displayName })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${parentListId}-id`}>Stable agent ID</Label>
                <Input
                  id={`${parentListId}-id`}
                  value={config.agentId}
                  placeholder="growth-os-lead"
                  onValueChange={(agentId) => setConfig(context.targetKey, { agentId })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${parentListId}-role`}>Fleet role</Label>
              <Select
                value={config.role}
                onValueChange={(role) => {
                  if (role === null) return;
                  setConfig(context.targetKey, {
                    role,
                    ...(role === "team_member" ? {} : { parentAgentId: null }),
                  });
                }}
              >
                <SelectTrigger id={`${parentListId}-role`}>
                  <SelectValue>{roleLabel(config.role)}</SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  {ROLE_OPTIONS.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </div>

            {config.role === "team_member" ? (
              <div className="space-y-1.5">
                <Label htmlFor={`${parentListId}-parent`}>Parent orchestrator ID</Label>
                <Input
                  nativeInput
                  id={`${parentListId}-parent`}
                  list={parentListId}
                  value={config.parentAgentId ?? ""}
                  placeholder="Select or enter an exact agent ID"
                  onChange={(event) =>
                    setConfig(context.targetKey, {
                      parentAgentId: event.currentTarget.value.trim() || null,
                    })
                  }
                />
                <datalist id={parentListId}>
                  {orchestrators.map((agent) => (
                    <option key={agent.agentId} value={agent.agentId}>
                      {agent.displayName}
                    </option>
                  ))}
                </datalist>
                <p className="text-xs text-muted-foreground">
                  Suggestions include only agents explicitly typed as orchestrators by PERSIST.
                </p>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor={`${parentListId}-boards`}>Boards</Label>
              <Input
                id={`${parentListId}-boards`}
                value={config.boardSlugsText}
                placeholder="persistence, popup-maker-growth"
                onValueChange={(boardSlugsText) => setConfig(context.targetKey, { boardSlugsText })}
              />
              <p className="text-xs text-muted-foreground">Comma-separated board slugs.</p>
            </div>

            {issue ? (
              <p role="status" className="text-xs text-amber-700 dark:text-amber-300">
                {issue}
              </p>
            ) : (
              <p role="status" className="text-xs text-emerald-700 dark:text-emerald-300">
                Ready to create the PERSIST-linked chat.
              </p>
            )}
          </div>
        ) : null}
      </PopoverPopup>
    </Popover>
  );
}

function usePersistComposerContributions(
  context: ComposerAddonContext,
): readonly ComposerAddonContributionInput[] {
  const config = usePersistNewChatStore(
    (state) => state.byTargetKey[context.targetKey] ?? DEFAULT_PERSIST_NEW_CHAT_CONFIG,
  );
  const fleet = useAtomValue(primaryPersistFleetAtom);
  const bindings = usePersistBindingsStore((state) => state.byThreadId);
  const normalizedAgentId = normalizePersistAgentId(config.agentId);
  const blockingIssue =
    persistNewChatConfigIssue(config) ??
    (normalizedAgentId !== "" &&
    ((fleet?.agents ?? []).some(
      (agent) => agent.agentId === normalizedAgentId && agent.threadId !== null,
    ) ||
      Object.values(bindings).some((binding) => binding.agentId === normalizedAgentId))
      ? "This agent ID already has a T3 chat"
      : null);
  return useMemo(
    () =>
      context.routeKind === "draft"
        ? [
            {
              contributionId: "agent-config",
              control: <PersistNewChatControl context={context} />,
              blockingIssue,
            },
          ]
        : [],
    [blockingIssue, context],
  );
}

export const persistComposerAddon: ComposerAddon = {
  useContributions: usePersistComposerContributions,
  readSubmissionPayload: readPersistNewChatConfig,
  commitSubmission: ({ threadRef, payload }) => commitPersistThreadBinding({ threadRef, payload }),
  clearSubmissionPayload: clearPersistNewChatConfig,
};
