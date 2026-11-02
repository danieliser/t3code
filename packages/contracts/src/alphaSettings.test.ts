import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import { CLIENT_GUARDED_RPC_SCOPES } from "./clientRpcPermissions.ts";
import { AuthOrchestrationOperateScope } from "./auth.ts";
import { WS_METHODS } from "./rpc.ts";
import {
  ClientSettingsSchema,
  ClientSettingsPatch,
  DEFAULT_SIDEBAR_THREAD_FILTERS,
} from "./settings.ts";

const decodeSettings = Schema.decodeUnknownSync(ClientSettingsSchema);
const decodePatch = Schema.decodeUnknownSync(ClientSettingsPatch);

describe("Alpha sidebar settings", () => {
  it("hydrates nested filters and hidden projects without changing upstream defaults", () => {
    const settings = decodeSettings({ sidebarThreadFilters: { recentOnly: true } });
    expect(settings.sidebarThreadFilters).toEqual({
      ...DEFAULT_SIDEBAR_THREAD_FILTERS,
      recentOnly: true,
    });
    expect(settings.sidebarHiddenProjectKeys).toEqual([]);
    expect(settings.sidebarThreadPreviewCount).toBe(6);
  });

  it("persists hidden projects and rejects invalid filters or preview bounds", () => {
    expect(
      decodePatch({ sidebarHiddenProjectKeys: ["local:project"] }).sidebarHiddenProjectKeys,
    ).toEqual(["local:project"]);
    expect(() => decodePatch({ sidebarThreadFilters: { statuses: ["unknown"] } })).toThrow();
    expect(() => decodePatch({ sidebarThreadPreviewCount: 0 })).toThrow();
    expect(() => decodePatch({ sidebarThreadPreviewCount: 16 })).toThrow();
  });

  it("requires orchestration permission before an addon mutation", () => {
    expect(CLIENT_GUARDED_RPC_SCOPES[WS_METHODS.serverExecuteAddonAction]).toBe(
      AuthOrchestrationOperateScope,
    );
  });
});
