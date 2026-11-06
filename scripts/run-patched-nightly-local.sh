#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
branch="perf/patched-nightly-qualified"
remote="origin"
upstream_branch="main"
release_dir="$repo_root/release/qualified-nightly"
state_dir="$release_dir/state"
lock_dir="$release_dir/.build.lock"
node_version="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).engines.node' "$repo_root/package.json")"
node_bin="$HOME/.nvm/versions/node/v$node_version/bin"
started_at="$(date +%s)"
export pnpm_config_verify_deps_before_run=false
exit_code=0
package_stage_dir=""

if [[ -x "$node_bin/node" ]]; then
  export PATH="$node_bin:$PATH"
fi
if [[ "$(node -p 'process.versions.node')" != "$node_version" ]]; then
  printf 'Required Node %s is not available. Install it before building.\n' "$node_version" >&2
  exit 2
fi

log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

finish() {
  exit_code=$?
  if [[ -n "$package_stage_dir" ]]; then
    rm -rf "$package_stage_dir"
  fi
  rm -f "$lock_dir/pid"
  rmdir "$lock_dir" 2>/dev/null || true
  log "finished status=$([[ $exit_code -eq 0 ]] && printf success || printf failure) exit=$exit_code duration_seconds=$(($(date +%s) - started_at))"
  exit "$exit_code"
}

mkdir -p "$release_dir" "$state_dir"
if ! mkdir "$lock_dir" 2>/dev/null; then
  sleep 1
  owner_pid="$(cat "$lock_dir/pid" 2>/dev/null || true)"
  owner_command=""
  if [[ "$owner_pid" =~ ^[0-9]+$ ]]; then
    owner_command="$(ps -p "$owner_pid" -o command= 2>/dev/null || true)"
  fi
  if [[ "$owner_command" == *"$repo_root/scripts/run-patched-nightly-local.sh"* ]]; then
    log "skipped reason=another_build_is_running owner_pid=$owner_pid"
    exit 0
  fi
  log "recovering stale lock owner_pid=${owner_pid:-unknown}"
  rm -f "$lock_dir/pid"
  rmdir "$lock_dir" 2>/dev/null || {
    log "skipped reason=lock_changed_during_stale_recovery"
    exit 0
  }
  mkdir "$lock_dir"
fi
printf '%s\n' "$$" > "$lock_dir/pid"
trap finish EXIT

cd "$repo_root"
current_branch="$(git branch --show-current)"
if [[ "$current_branch" != "$branch" ]]; then
  log "failed reason=wrong_branch branch=$current_branch"
  exit 2
fi
if [[ -n "$(git status --porcelain=v1)" ]]; then
  log "failed reason=working_tree_not_clean"
  exit 2
fi

log "started branch=$branch upstream=$remote/$upstream_branch"
git fetch --no-tags "$remote" "refs/heads/$upstream_branch:refs/remotes/$remote/$upstream_branch"
upstream_ref="refs/remotes/$remote/$upstream_branch"
upstream_sha="$(git rev-parse "$upstream_ref")"
state_file="$state_dir/last-successful-upstream"
head_state_file="$state_dir/last-successful-head"
source_sha="$(git rev-parse HEAD)"
last_successful_head=""
[[ ! -f "$head_state_file" ]] || last_successful_head="$(cat "$head_state_file")"
last_successful_upstream=""
[[ ! -f "$state_file" ]] || last_successful_upstream="$(cat "$state_file")"
if [[ "$upstream_sha" == "$last_successful_upstream" && "$source_sha" == "$last_successful_head" ]]; then
  log "skipped reason=no_upstream_changes upstream=$upstream_sha"
  exit 0
fi

log "upstream_changed previous=${last_successful_upstream:-none} current=$upstream_sha"
if ! "$repo_root/scripts/update-patched-nightly.sh" --remote "$remote" --upstream "$upstream_branch" --branch "$branch"; then
  if [[ -d "$(git rev-parse --git-path rebase-merge)" || -d "$(git rev-parse --git-path rebase-apply)" ]]; then
    git rebase --abort
  fi
  printf 'Upstream %s requires replay review. See scheduler logs and the updater recovery branch.\n' "$upstream_sha" > "$state_dir/needs-review.txt"
  log "failed reason=upstream_replay_needs_review upstream=$upstream_sha"
  exit 4
fi
if [[ -n "$(git status --porcelain=v1)" ]]; then
  log "failed reason=updater_left_worktree_dirty"
  exit 2
fi

base_version="$(node -p 'JSON.parse(require("fs").readFileSync("apps/desktop/package.json", "utf8")).version.split("-")[0]')"
replay_count="$(git cherry "$upstream_ref" HEAD | awk '$1 == "+" { count += 1 } END { print count + 0 }')"
build_date="$(date -u +%Y%m%d)"
build_version="${base_version}-alpha.patched-qualified.${build_date}.${replay_count}"
if [[ -e "$release_dir/T3-Code-$build_version-arm64.dmg" ]]; then
  build_version="$build_version.$(date -u +%H%M%S)"
fi

log "building version=$build_version upstream=$upstream_sha replay_commits=$replay_count"
required_pnpm_version="$(node -p 'JSON.parse(require("fs").readFileSync("package.json", "utf8")).packageManager.split("@").at(-1)')"
toolchain_dir="$release_dir/toolchain"
if [[ -x "$toolchain_dir/node_modules/.bin/pnpm" ]]; then
  export PATH="$toolchain_dir/node_modules/.bin:$PATH"
fi
if [[ "$(pnpm --version 2>/dev/null || true)" != "$required_pnpm_version" ]]; then
  log "package_manager_bootstrap_started version=$required_pnpm_version"
  npm install --prefix "$toolchain_dir" --no-audit --no-fund "pnpm@$required_pnpm_version"
  export PATH="$toolchain_dir/node_modules/.bin:$PATH"
fi
[[ "$(pnpm --version)" == "$required_pnpm_version" ]] || {
  log "failed reason=package_manager_version_mismatch"
  exit 2
}

lockfile_sha="$(shasum -a 256 pnpm-lock.yaml | awk '{ print $1 }')"
installed_lockfile="$state_dir/installed-pnpm-lock-sha256"
if [[ -f "$installed_lockfile" && "$(cat "$installed_lockfile")" == "$lockfile_sha" && -f node_modules/.pnpm/lock.yaml ]]; then
  log "dependencies_skipped reason=lockfile_unchanged sha256=$lockfile_sha"
else
  log "dependencies_install_started reason=lockfile_changed_or_missing_install"
  pnpm install --frozen-lockfile
  tmp_installed_lockfile="$installed_lockfile.tmp.$$"
  printf '%s\n' "$lockfile_sha" > "$tmp_installed_lockfile"
  mv "$tmp_installed_lockfile" "$installed_lockfile"
  log "dependencies_install_finished sha256=$lockfile_sha"
fi

log "qualification_started"
node_modules/.bin/vp test run \
  apps/server/src/orchestration-v2/Orchestrator.control-reads.test.ts \
  apps/server/src/orchestration-v2/http.test.ts \
  apps/server/src/addons/persist/PersistContextInjection.test.ts \
  apps/server/src/addons/persist/PersistFleetProjection.test.ts \
  apps/server/src/addons/persist/PersistThreadRoutes.test.ts \
  apps/server/src/addons/persist/PersistFleetEvents.test.ts \
  apps/web/src/addons/bundled/persist/bindingsStore.test.ts \
  apps/web/src/addons/sidebar.test.tsx \
  apps/web/src/components/Sidebar.logic.test.ts \
  apps/web/src/components/settings/SettingsPanels.logic.test.ts \
  apps/desktop/src/settings/DesktopRendererState.test.ts \
  apps/desktop/src/window/RendererStateFlush.test.ts
for package in web server desktop; do
  (cd "apps/$package" && ../../node_modules/.bin/vp run typecheck)
done
log "qualification_finished"

package_stage_dir="$(mktemp -d "$release_dir/.package-$build_version.XXXXXX")"
zip_dir="$package_stage_dir"
extract_dir="$zip_dir/extracted"
installer_template_dir="$state_dir/dmg-template"
mkdir -p "$extract_dir"

log "packaging_zip_started version=$build_version"
pnpm run dist:desktop:artifact --platform mac --target zip --arch arm64 --build-version "$build_version" --output-dir "$zip_dir"
zip_artifact="$zip_dir/T3-Code-$build_version-arm64.zip"
if [[ ! -f "$zip_artifact" ]]; then
  log "failed reason=build_produced_no_zip expected=$zip_artifact"
  exit 3
fi
unzip -tq "$zip_artifact"
ditto -x -k "$zip_artifact" "$extract_dir"
app_path="$(find "$extract_dir" -maxdepth 3 -type d -name '*.app' -print -quit)"
if [[ -z "$app_path" || ! -d "$app_path" ]]; then
  log "failed reason=zip_missing_app_bundle"
  exit 3
fi

for template_asset in .DS_Store .background.tiff .VolumeIcon.icns; do
  if [[ ! -s "$installer_template_dir/$template_asset" ]]; then
    log "failed reason=styled_dmg_template_missing asset=$template_asset"
    exit 3
  fi
  cp "$installer_template_dir/$template_asset" "$extract_dir/$template_asset"
done

artifact="$release_dir/T3-Code-$build_version-arm64.dmg"
ln -s /Applications "$extract_dir/Applications"
log "packaging_dmg_started method=hdiutil_styled_template version=$build_version"
hdiutil create -volname "T3 Code (Alpha) $build_version Installer" -srcfolder "$extract_dir" -fs HFS+ -format UDZO -imagekey zlib-level=4 -ov "$artifact"
hdiutil verify "$artifact" >/dev/null
shasum -a 256 "$artifact" > "$artifact.sha256"
cp "$zip_artifact" "$release_dir/$(basename "$zip_artifact")"
shasum -a 256 "$release_dir/$(basename "$zip_artifact")" > "$release_dir/$(basename "$zip_artifact").sha256"

app_version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app_path/Contents/Info.plist")
app_executable=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app_path/Contents/Info.plist")
app_archs="$(lipo -archs "$app_path/Contents/MacOS/$app_executable")"
if [[ "$app_version" != "$build_version" || "$app_archs" != *arm64* ]]; then
  log "failed reason=packaged_app_metadata_mismatch version=$app_version archs=$app_archs"
  exit 3
fi

tmp_state="$state_file.tmp.$$"
printf '%s\n' "$upstream_sha" > "$tmp_state"
mv "$tmp_state" "$state_file"
printf '%s\n' "$(git rev-parse HEAD)" > "$head_state_file"
rm -f "$state_dir/needs-review.txt"
log "succeeded version=$build_version upstream=$upstream_sha artifacts=2 app_archs=$app_archs publish=never"
