# Qualified patched nightly

`run-patched-nightly-local.sh` fetches `origin/main` once per day and rebuilds
the local ARM64 DMG only when that upstream ref has advanced beyond the last
successful build. It rebases the committed custom stack with
`update-patched-nightly.sh`, installs the frozen lockfile, and verifies the DMG
with `hdiutil`. A dirty tree, rebase conflict, or build failure stops the run
without advancing the last-success marker. An atomic directory lock prevents
overlap. Artifacts and checksums stay under `release/qualified-nightly/`; the
routine never publishes or uploads them.

Install or refresh the user LaunchAgent after copying the plist to
`~/Library/LaunchAgents/com.danieliser.t3code.patched-nightly-qualified.plist`:

```sh
launchctl bootout "gui/$(id -u)"/com.danieliser.t3code.patched-nightly-qualified 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.danieliser.t3code.patched-nightly-qualified.plist"
```

The schedule runs daily at 03:30 local time. Run the script manually to build
on demand. Inspect scheduler logs and generated DMGs in `release/qualified-nightly/`.
