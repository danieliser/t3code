import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";

import { persistSidebarAddon } from "./persist/sidebar";
import { persistComposerAddon } from "./persist/composer";
import type { ComposerAddonContext, ComposerAddonContribution } from "./composer";
import type { SidebarThreadAddonContribution } from "./sidebar";

const BUNDLED_SIDEBAR_ADDONS = [persistSidebarAddon] as const;
const BUNDLED_COMPOSER_ADDONS = [persistComposerAddon] as const;

export function useComposerAddonContributions(
  context: ComposerAddonContext,
): readonly ComposerAddonContribution[] {
  return persistComposerAddon.useContributions(context);
}

export function readComposerAddonSubmissionPayloads(
  targetKey: string,
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    BUNDLED_COMPOSER_ADDONS.flatMap((addon) => {
      const payload = addon.readSubmissionPayload?.(targetKey) ?? null;
      return payload === null ? [] : [[addon.id, payload]];
    }),
  );
}

export function clearComposerAddonSubmissionPayloads(targetKey: string): void {
  for (const addon of BUNDLED_COMPOSER_ADDONS) {
    addon.clearSubmissionPayload?.(targetKey);
  }
}

export function commitComposerAddonSubmissionPayloads(input: {
  readonly targetKey: string;
  readonly threadId: string;
  readonly payloads: Readonly<Record<string, unknown>>;
}): void {
  for (const addon of BUNDLED_COMPOSER_ADDONS) {
    const payload = input.payloads[addon.id];
    if (payload === undefined) continue;
    addon.commitSubmission?.({
      targetKey: input.targetKey,
      threadId: input.threadId,
      payload,
    });
    addon.clearSubmissionPayload?.(input.targetKey);
  }
}

export { ComposerAddonSlot, composerAddonBlockingIssue } from "./composer";
export type { ComposerAddon, ComposerAddonContext, ComposerAddonContribution } from "./composer";

/**
 * Build-time addon registration. Custom Alpha builds bundle their addons here;
 * core sidebar code consumes only the contribution API.
 */
export function useSidebarAddonThreadContributions(
  threads: readonly EnvironmentThreadShell[],
): readonly SidebarThreadAddonContribution[] {
  const contributionSets = BUNDLED_SIDEBAR_ADDONS.map((addon) =>
    addon.useThreadContributions(threads),
  );
  return contributionSets.flat();
}

export { groupThreadsWithAddonContributions } from "./sidebar";
export type {
  SidebarThreadAddonContribution,
  SidebarThreadAddonGroup,
  SidebarThreadAddonMember,
} from "./sidebar";
