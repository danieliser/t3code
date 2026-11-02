// Preview builds share nightly branding but ship without an update feed.
const PRERELEASE_VERSION_PATTERN =
  /^[^-+]+-(?:nightly|preview|alpha\.patched(?:-qualified)?)\.\d{8}\.\d+(?:\.\d+)?$/;

export function isNightlyDesktopVersion(version: string): boolean {
  return PRERELEASE_VERSION_PATTERN.test(version);
}
