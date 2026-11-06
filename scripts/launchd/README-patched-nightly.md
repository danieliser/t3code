# Qualified patched nightly

`run-patched-nightly-local.sh` fetches `origin/main` once per day and rebuilds
the local ARM64 DMG only when that upstream ref has advanced beyond the last
successful build. It rebases the committed custom stack with
`update-patched-nightly.sh`, installs the frozen lockfile, and verifies the DMG
with `hdiutil`. A dirty tree, rebase conflict, or build failure stops the run
without advancing the last-success marker. An atomic directory lock prevents
overlap. Artifacts and checksums stay under `release/qualified-nightly/`; the
routine never publishes or uploads them. If the shared pnpm launcher is missing,
broken or on another version, the routine bootstraps the package.json-pinned
version under `release/qualified-nightly/toolchain/` without changing global tools.

Install or refresh the user LaunchAgent after copying the plist to
`~/Library/LaunchAgents/com.danieliser.t3code.patched-nightly-qualified.plist`:

```sh
launchctl bootout "gui/$(id -u)"/com.danieliser.t3code.patched-nightly-qualified 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.danieliser.t3code.patched-nightly-qualified.plist"
```

The schedule runs daily at 03:30 local time. Run the script manually to build
on demand. Inspect scheduler logs and generated DMGs in `release/qualified-nightly/`.

External orchestration clients use protocol 2. Send
`x-t3-orchestration-protocol: 2` and a scoped bearer token to
`GET /api/orchestration/shell`, `GET /api/orchestration/threads/:threadId`,
`POST /api/orchestration/dispatch`, and
`POST /api/orchestration/threads/:threadId/context-injections`.
Reads require `orchestration:read`; writes require `orchestration:operate`.
Dispatch accepts the current `OrchestrationV2Command` schema and returns
`{ sequence }`. Reuse a command ID only for the identical command after an
uncertain response; observe the thread before deciding whether to retry.
The pre-v2 `/snapshot` and `thread.turn.start` API is unsupported: migrate
older helpers to `/shell` and `message.dispatch` or use the bundled CLI.
Context injection requires a live provider session with injection support
(currently Codex); it does not start a new turn.

Context injection also supports `GET` on its collection URL for capability
discovery, and `GET .../context-injections/:injectionId` for a receipt.
Injection IDs are scoped to the thread and payload. Reusing one with different
text is rejected. A native acknowledgement records `provider-adopted`;
`accepted` and `indeterminate` remain unresolved and are never sent again
automatically. A receipt proves native RPC acknowledgement, with model
consumption explicitly unproven. Receipts store a payload hash rather than the
context text. The PERSIST gateway's existing `{ injectionId, injected: true }`
readback remains supported.
