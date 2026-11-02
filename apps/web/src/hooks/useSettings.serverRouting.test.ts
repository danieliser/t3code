import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { shouldWarnPrimarySettingsUnavailable } from "./useSettings";

describe("primary settings write routing", () => {
  const primaryId = EnvironmentId.make("env-primary");

  it("does not warn for a shared-only patch when the primary is connected", () => {
    expect(shouldWarnPrimarySettingsUnavailable(primaryId, {})).toBe(false);
  });

  it("does not warn for a shared-only patch without a primary", () => {
    expect(shouldWarnPrimarySettingsUnavailable(null, {})).toBe(false);
  });

  it("warns when a primary-only patch has no target", () => {
    expect(
      shouldWarnPrimarySettingsUnavailable(null, {
        enableAgentBrowserAccess: false,
      }),
    ).toBe(true);
  });
});
