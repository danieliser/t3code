import type { PersistFleetAgent, PersistFleetRole } from "@t3tools/contracts";
import { CircleDotIcon, NetworkIcon } from "lucide-react";

import { cn } from "../../lib/utils";

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
    className: "text-sky-600 dark:text-sky-400",
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

function FleetWorkState(props: { readonly agent: PersistFleetAgent }) {
  const workState = WORK_STATE[props.agent.work.state];
  return (
    <span
      role="status"
      className={cn("inline-flex shrink-0 items-center gap-1 font-medium", workState.className)}
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
        "shrink-0",
        props.agent.mailbox.state === "online"
          ? "text-emerald-700 dark:text-emerald-300"
          : "text-muted-foreground",
      )}
    >
      {label}
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
  const roleLabel =
    props.agent.role === null ? "Unclassified agent" : ROLE_LABELS[props.agent.role];
  const claimedItems = props.agent.session.claimedItems;
  const lapsedClaims = props.agent.session.lapsedClaims;
  const completedItems = props.agent.session.completedItems;

  if (props.variant === "compact") {
    return (
      <span
        data-testid="sidebar-fleet-agent-meta-compact"
        className="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground"
        aria-label={`${props.agent.displayName}, ${roleLabel}`}
      >
        <NetworkIcon aria-hidden className="size-3 text-fuchsia-500" />
        <span className="hidden max-w-24 truncate min-[280px]:inline">{roleLabel}</span>
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
      className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-secondary-label"
    >
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-fuchsia-500/12 px-1.5 py-0.5 font-semibold text-[10px] text-fuchsia-700 uppercase tracking-wide dark:text-fuchsia-300">
        <NetworkIcon aria-hidden className="size-2.5" />
        PERSIST
      </span>
      <span className="min-w-0 truncate font-medium text-foreground/80">
        {props.agent.displayName}
      </span>
      <span aria-hidden>·</span>
      <span className="shrink-0">{roleLabel}</span>
      {props.childCount !== undefined && props.childCount > 0 ? (
        <span className="shrink-0">{props.childCount} agents</span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">
        <BoardLinks agent={props.agent} />
      </span>
      <FleetPresenceState agent={props.agent} />
      {claimedItems !== null ? <span className="shrink-0">{claimedItems} claimed</span> : null}
      {lapsedClaims !== null && lapsedClaims > 0 ? (
        <span className="shrink-0">{lapsedClaims} lapsed</span>
      ) : null}
      {completedItems !== null ? <span className="shrink-0">{completedItems} done</span> : null}
      <FleetWorkState agent={props.agent} />
    </span>
  );
}
