import { expect, it } from "vite-plus/test";
import { getDesktopUpdateReleaseUrl, isPatchedNightlyDesktopVersion } from "./desktopUpdate.logic";

it("opens a qualified Alpha release on the fork while preserving configured repository URLs", () => {
  const version = "0.0.45-alpha.patched-qualified.20261102.69";
  expect(isPatchedNightlyDesktopVersion(version)).toBe(true);
  expect(getDesktopUpdateReleaseUrl(version)).toBe(
    `https://github.com/danieliser/t3code/releases/tag/v${version}`,
  );
  expect(getDesktopUpdateReleaseUrl(version, "another/fork")).toBe(
    `https://github.com/another/fork/releases/tag/v${version}`,
  );
});
