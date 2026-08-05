# Nightly++ release automation

`nightly-plus.yml` checks the newest upstream Nightly tag every three hours. When a new tag is not
already contained in `perf/patched-nightly`, it rebases the replay stack onto upstream `main`, pushes
the refreshed branch with a lease, builds the macOS arm64 DMG/ZIP/update manifest, and publishes a
prerelease in `danieliser/t3code`.

The workflow must exist on the fork's default branch for GitHub's schedule to run. Keep the same file
on `perf/patched-nightly` so the automation itself remains part of the replay stack.

Patched versions use the `nightly` updater channel but retain Alpha product branding. The packaged
`app-update.yml` points at the repository selected by `T3CODE_DESKTOP_UPDATE_REPOSITORY`. The Alpha
sidebar checks that feed and opens the exact Nightly++ release page when an update is available.

Unsigned macOS builds intentionally use manual DMG installation. To enable the normal one-click
updater, configure `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`,
`APPLE_API_ISSUER`, `APPLE_TEAM_ID`, and `MACOS_PROVISIONING_PROFILE` in the fork's Actions settings.

If replaying conflicts, the workflow stops before pushing or publishing. Resolve the replay locally,
push the repaired branch, and rerun the workflow with `force` enabled.
