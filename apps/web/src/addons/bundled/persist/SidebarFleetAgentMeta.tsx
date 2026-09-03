import type { PersistFleetAgent, PersistFleetRole } from "@t3tools/contracts";
import { CircleDotIcon } from "lucide-react";

import jarvisAvatarUrl from "../../../assets/jarvis-avatar.png";
import { cn } from "../../../lib/utils";

const ROLE_LABELS: Readonly<Record<PersistFleetRole, string>> = {
  commander: "Commander",
  orchestrator: "Orchestrator",
  product: "Product agent",
  team_member: "Team agent",
  coordinator: "Coordinator",
};

const WORK_STATE = {
  active: {
    label: "Running",
    className: "text-teal-700 dark:text-[#76e7bd]",
  },
  idle_waiting: {
    label: "Waiting",
    className: "text-amber-700 dark:text-amber-300",
  },
  blocked: {
    label: "Blocked",
    className: "text-red-700 dark:text-red-300",
  },
  unknown: {
    label: "Work unknown",
    className: "text-muted-foreground/70",
  },
} as const;

const AGENT_NAME_ACRONYMS: Readonly<Record<string, string>> = {
  ai: "AI",
  api: "API",
  mcp: "MCP",
  os: "OS",
  persist: "PERSIST",
  qa: "QA",
  t3: "T3",
  ui: "UI",
  ux: "UX",
};

function humanizeAgentId(agentId: string): string {
  return agentId
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      return AGENT_NAME_ACRONYMS[lower] ?? `${part.charAt(0).toUpperCase()}${part.slice(1)}`;
    })
    .join(" ");
}

export function persistAgentDisplayName(agent: PersistFleetAgent): string {
  const displayName = agent.displayName.trim();
  return displayName.toLowerCase() === agent.agentId.trim().toLowerCase()
    ? humanizeAgentId(agent.agentId)
    : displayName;
}

function roleLabel(agent: PersistFleetAgent): string {
  return agent.role === null ? "Unclassified agent" : ROLE_LABELS[agent.role];
}

function JarvisAvatar(props: { readonly className: string }) {
  return (
    <img
      aria-hidden
      alt=""
      src={jarvisAvatarUrl}
      className={cn("shrink-0 rounded-full bg-[#0b1512] object-cover", props.className)}
    />
  );
}

function FleetWorkState(props: { readonly agent: PersistFleetAgent }) {
  const workState = WORK_STATE[props.agent.work.state];
  return (
    <span
      role="status"
      className={cn(
        "hidden shrink-0 items-center gap-1 font-medium @min-[360px]/persist-meta:inline-flex",
        workState.className,
      )}
    >
      <CircleDotIcon aria-hidden className="size-3" />
      {workState.label}
    </span>
  );
}

function FleetPresenceState(props: { readonly agent: PersistFleetAgent }) {
  const label =
    props.agent.mailbox.state === "never_seen"
      ? "Never seen"
      : props.agent.mailbox.state.charAt(0).toUpperCase() + props.agent.mailbox.state.slice(1);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1",
        props.agent.mailbox.state === "online"
          ? "text-emerald-700 dark:text-emerald-300"
          : "text-muted-foreground",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full bg-current",
          props.agent.mailbox.state !== "online" && "opacity-55",
        )}
      />
      <span className="hidden @min-[220px]/persist-meta:inline">{label}</span>
      <span className="sr-only @min-[220px]/persist-meta:hidden">{label}</span>
    </span>
  );
}

function BoardLinks(props: { readonly agent: PersistFleetAgent }) {
  const visibleBoards = props.agent.boards.slice(0, 2);
  if (visibleBoards.length === 0) return null;
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      {visibleBoards.map((board, index) => (
        <span key={board.boardId} className="inline-flex min-w-0 items-center gap-1">
          {index > 0 ? <span aria-hidden>·</span> : null}
          <a
            href={board.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="max-w-24 truncate hover:text-foreground hover:underline"
          >
            {board.title}
          </a>
        </span>
      ))}
      {props.agent.boards.length > visibleBoards.length ? (
        <span aria-label={`${props.agent.boards.length - visibleBoards.length} more boards`}>
          +{props.agent.boards.length - visibleBoards.length}
        </span>
      ) : null}
    </span>
  );
}

export function SidebarFleetAgentMeta(props: {
  readonly agent: PersistFleetAgent;
  readonly variant: "card" | "compact";
  readonly childCount?: number;
}) {
  const displayName = persistAgentDisplayName(props.agent);
  const agentRoleLabel = roleLabel(props.agent);
  const claimedItems = props.agent.session.claimedItems;
  const lapsedClaims = props.agent.session.lapsedClaims;
  const completedItems = props.agent.session.completedItems;

  if (props.variant === "compact") {
    return (
      <span
        data-testid="sidebar-fleet-agent-meta-compact"
        className="inline-flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden text-[11px] text-muted-foreground"
        aria-label={`${displayName}, ${agentRoleLabel}`}
      >
        <JarvisAvatar className="size-4" />
        <span
          data-testid="sidebar-fleet-agent-name"
          className="max-w-28 truncate font-medium text-foreground/80"
        >
          {displayName}
        </span>
        <span className="hidden shrink-0 min-[360px]:inline">{agentRoleLabel}</span>
        <BoardLinks agent={props.agent} />
        <FleetPresenceState agent={props.agent} />
        {claimedItems !== null ? <span>{claimedItems} claimed</span> : null}
        {completedItems !== null ? <span>{completedItems} done</span> : null}
        <FleetWorkState agent={props.agent} />
      </span>
    );
  }

  return (
    <span
      data-testid="sidebar-fleet-agent-meta-card"
      className="@container/persist-meta flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden whitespace-nowrap text-xs text-secondary-label"
    >
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#0b1512] py-0.5 pr-2 pl-1 font-semibold text-[10px] text-[#76e7bd] uppercase tracking-wide ring-1 ring-[#76e7bd]/35">
        <JarvisAvatar className="size-3.5" />
        PERSIST
      </span>
      <span className="min-w-10 flex-1 truncate font-medium text-foreground/80">{displayName}</span>
      <span aria-hidden className="hidden @min-[270px]/persist-meta:inline">
        ·
      </span>
      <span className="hidden shrink-0 @min-[270px]/persist-meta:inline">{agentRoleLabel}</span>
      {props.childCount !== undefined && props.childCount > 0 ? (
        <span className="hidden shrink-0 @min-[440px]/persist-meta:inline">
          {props.childCount} agents
        </span>
      ) : null}
      <span className="hidden min-w-0 max-w-28 truncate @min-[560px]/persist-meta:inline">
        <BoardLinks agent={props.agent} />
      </span>
      <FleetPresenceState agent={props.agent} />
      {claimedItems !== null ? (
        <span className="hidden shrink-0 @min-[440px]/persist-meta:inline">
          {claimedItems} claimed
        </span>
      ) : null}
      {lapsedClaims !== null && lapsedClaims > 0 ? (
        <span className="hidden shrink-0 @min-[650px]/persist-meta:inline">
          {lapsedClaims} lapsed
        </span>
      ) : null}
      {completedItems !== null ? (
        <span className="hidden shrink-0 @min-[500px]/persist-meta:inline">
          {completedItems} done
        </span>
      ) : null}
      <FleetWorkState agent={props.agent} />
    </span>
  );
}

function metric(value: number | null, fallback = "Unknown"): string {
  return value === null ? fallback : String(value);
}

export function SidebarFleetAgentHoverDetail(props: {
  readonly agent: PersistFleetAgent;
  readonly childCount?: number;
}) {
  const displayName = persistAgentDisplayName(props.agent);
  const work = WORK_STATE[props.agent.work.state];
  const lifecycle = props.agent.lifecycle ?? "unknown";

  return (
    <div data-testid="sidebar-fleet-agent-hover-detail" className="min-w-64 space-y-2 text-xs">
      <div className="flex min-w-0 items-center gap-2">
        <JarvisAvatar className="size-8 ring-1 ring-[#76e7bd]/40" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-foreground">{displayName}</div>
          <div className="truncate font-mono text-[10px] text-muted-foreground">
            {props.agent.agentId}
          </div>
        </div>
        <span className="rounded-full bg-[#0b1512] px-2 py-1 font-semibold text-[10px] text-[#76e7bd] uppercase tracking-wide ring-1 ring-[#76e7bd]/30">
          PERSIST
        </span>
      </div>

      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-muted-foreground">
        <span>Role</span>
        <span className="text-foreground/80">{roleLabel(props.agent)}</span>
        <span>Project</span>
        <span className="text-foreground/80">{props.agent.projectKey ?? "Unknown"}</span>
        <span>Lifecycle</span>
        <span className="capitalize text-foreground/80">{lifecycle}</span>
        <span>Presence</span>
        <span className="text-foreground/80">
          {props.agent.mailbox.state === "never_seen"
            ? "Never seen"
            : props.agent.mailbox.state.charAt(0).toUpperCase() +
              props.agent.mailbox.state.slice(1)}
        </span>
        <span>Work</span>
        <span className={work.className}>{work.label}</span>
        {props.childCount !== undefined && props.childCount > 0 ? (
          <>
            <span>Managed team</span>
            <span className="text-foreground/80">{props.childCount} agents</span>
          </>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-md bg-[#0b1512]/95 p-2 text-center ring-1 ring-[#76e7bd]/20">
        <div>
          <div className="font-semibold text-[#76e7bd]">{metric(props.agent.work.activeTasks)}</div>
          <div className="text-[10px] text-[#9adbc8]">running</div>
        </div>
        <div>
          <div className="font-semibold text-[#76e7bd]">
            {metric(props.agent.work.waitingTasks)}
          </div>
          <div className="text-[10px] text-[#9adbc8]">waiting</div>
        </div>
        <div>
          <div className="font-semibold text-[#76e7bd]">
            {metric(props.agent.session.completedItems)}
          </div>
          <div className="text-[10px] text-[#9adbc8]">done</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
        <span>{metric(props.agent.session.claimedItems)} claimed</span>
        <span>{metric(props.agent.session.lapsedClaims)} lapsed</span>
        <span>{metric(props.agent.work.blockedTasks)} blocked</span>
      </div>

      {props.agent.boards.length > 0 ? (
        <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
          <span className="shrink-0">Boards</span>
          <BoardLinks agent={props.agent} />
        </div>
      ) : null}
    </div>
  );
}
