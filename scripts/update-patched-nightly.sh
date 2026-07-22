#!/usr/bin/env bash

set -euo pipefail

remote="origin"
upstream_branch="main"
target_branch="perf/patched-nightly"
dry_run=false

usage() {
  printf '%s\n' \
    "Usage: scripts/update-patched-nightly.sh [options]" \
    "" \
    "Rebase the local patch stack onto the newest nightly branch." \
    "Patch-equivalent commits already present upstream are reported and dropped by rebase." \
    "" \
    "Options:" \
    "  --remote <name>     Git remote to fetch (default: origin)" \
    "  --upstream <name>   Upstream branch on the remote (default: main)" \
    "  --branch <name>     Local patch-stack branch (default: perf/patched-nightly)" \
    "  --dry-run           Fetch and report the replay plan without rebasing" \
    "  -h, --help          Show this help"
}

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --remote)
      [[ $# -ge 2 ]] || die "--remote requires a value"
      remote="$2"
      shift 2
      ;;
    --upstream)
      [[ $# -ge 2 ]] || die "--upstream requires a value"
      upstream_branch="$2"
      shift 2
      ;;
    --branch)
      [[ $# -ge 2 ]] || die "--branch requires a value"
      target_branch="$2"
      shift 2
      ;;
    --dry-run)
      dry_run=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "unknown option: $1"
      ;;
  esac
done

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || die "not inside a Git repository"
cd "$repo_root"

current_branch="$(git symbolic-ref --quiet --short HEAD)" || die "detached HEAD is not supported"
[[ "$current_branch" == "$target_branch" ]] ||
  die "current branch is '$current_branch'; switch to '$target_branch' first"

[[ -z "$(git status --porcelain=v1)" ]] || die "working tree must be clean before replaying patches"

for operation in rebase-merge rebase-apply CHERRY_PICK_HEAD MERGE_HEAD REVERT_HEAD; do
  operation_path="$(git rev-parse --git-path "$operation")"
  [[ ! -e "$operation_path" ]] || die "another Git operation is already in progress ($operation)"
done

upstream_ref="refs/remotes/${remote}/${upstream_branch}"

printf 'Fetching %s/%s...\n' "$remote" "$upstream_branch"
git fetch --tags "$remote" "$upstream_branch"
git show-ref --verify --quiet "$upstream_ref" || die "fetch did not resolve $upstream_ref"

nightly_tag="$(git describe --tags --exact-match "$upstream_ref" 2>/dev/null || true)"
upstream_short="$(git rev-parse --short "$upstream_ref")"
if [[ -n "$nightly_tag" ]]; then
  printf 'Upstream nightly: %s (%s)\n' "$nightly_tag" "$upstream_short"
else
  printf 'Upstream commit: %s\n' "$upstream_short"
fi

replay_count=0
retire_count=0
cherry_plan="$(git cherry -v "$upstream_ref" HEAD)"

if [[ -z "$cherry_plan" ]]; then
  printf 'Patch stack is empty.\n'
else
  printf 'Patch replay plan:\n'
  while IFS=' ' read -r marker sha subject; do
    [[ -n "$marker" ]] || continue
    if [[ "$marker" == "+" ]]; then
      replay_count=$((replay_count + 1))
      printf '  replay  %s %s\n' "${sha:0:10}" "$subject"
    else
      retire_count=$((retire_count + 1))
      printf '  retire  %s %s (already upstream)\n' "${sha:0:10}" "$subject"
    fi
  done <<< "$cherry_plan"
fi

printf 'Plan summary: %d replay, %d retire.\n' "$replay_count" "$retire_count"

if [[ "$dry_run" == true ]]; then
  printf 'Dry run complete; branch history was not changed.\n'
  exit 0
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_stem="${target_branch//\//-}"
head_short="$(git rev-parse --short HEAD)"
backup_branch="backup/${backup_stem}-${timestamp}-${head_short}"
git branch "$backup_branch" HEAD
printf 'Recovery branch: %s\n' "$backup_branch"

if ! git rebase --empty=drop "$upstream_ref"; then
  printf '%s\n' \
    "Replay stopped on a conflict." \
    "Resolve files and run 'git rebase --continue', or run 'git rebase --abort'." \
    "The pre-update state is preserved at '$backup_branch'." >&2
  exit 1
fi

printf 'Updated %s onto %s.\n' "$target_branch" "$upstream_short"
if [[ "$retire_count" -gt 0 ]]; then
  printf 'Removed %d patch-equivalent commit(s) now supplied by upstream.\n' "$retire_count"
fi
