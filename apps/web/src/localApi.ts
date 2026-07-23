import type {
  ConfirmDialogOptions,
  ContextMenuItem,
  DesktopRendererStateKey,
  LocalApi,
} from "@t3tools/contracts";

import { requestConfirmDialog } from "./confirmDialog";
import { dismissContextMenu, showContextMenuFallback } from "./contextMenuFallback";
import {
  readBrowserClientSettings,
  removeBrowserClientSettings,
  writeBrowserClientSettings,
} from "./clientPersistenceStorage";
import { resetRequestLatencyStateForTests } from "./rpc/requestLatencyState";

const rendererStateStorageKeys = {
  "ui-state": "t3code:ui-state:v1",
  "composer-preferences": "t3code:composer-preferences:v1",
} as const satisfies Record<DesktopRendererStateKey, string>;

function readValidBrowserRendererState(key: DesktopRendererStateKey): string | null {
  const raw = window.localStorage.getItem(rendererStateStorageKeys[key]);
  if (raw === null) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? raw : null;
  } catch {
    return null;
  }
}

let cachedApi: LocalApi | undefined;

function createBrowserLocalApi(): LocalApi {
  return {
    dialogs: {
      pickFolder: async (options) => {
        if (!window.desktopBridge) return null;
        return window.desktopBridge.pickFolder(options);
      },
      confirm: async (message, options?: ConfirmDialogOptions) => {
        return requestConfirmDialog(message, options) ?? false;
      },
    },
    shell: {
      openExternal: async (url) => {
        if (window.desktopBridge) {
          const opened = await window.desktopBridge.openExternal(url);
          if (!opened) {
            throw new Error("Unable to open link.");
          }
          return;
        }

        window.open(url, "_blank", "noopener,noreferrer");
      },
      // Only the desktop shell can reach the OS; the web build (and older
      // desktop shells that predate this method) have nothing to open.
      openSystemSettings: async (pane) => {
        if (!window.desktopBridge?.openSystemSettings) {
          throw new Error("Unable to open System Settings.");
        }
        const opened = await window.desktopBridge.openSystemSettings(pane);
        if (!opened) {
          throw new Error("Unable to open System Settings.");
        }
      },
    },
    contextMenu: {
      show: async <T extends string>(
        items: readonly ContextMenuItem<T>[],
        position?: { x: number; y: number },
      ): Promise<T | null> => {
        if (window.desktopBridge) {
          return window.desktopBridge.showContextMenu(items, position) as Promise<T | null>;
        }
        return showContextMenuFallback(items, position);
      },
      // A native desktop menu blocks keyboard input and closes on outside
      // interaction, so nothing to do there; the DOM fallback needs an explicit
      // dismiss when the state behind it goes away.
      close: async () => {
        if (!window.desktopBridge) {
          dismissContextMenu();
        }
      },
    },
    persistence: {
      getClientSettings: async () => {
        if (window.desktopBridge) {
          const persistedSettings = await window.desktopBridge.getClientSettings();
          if (persistedSettings) {
            return persistedSettings;
          }

          const legacySettings = readBrowserClientSettings();
          if (!legacySettings) {
            return null;
          }
          await window.desktopBridge.setClientSettings(legacySettings);
          removeBrowserClientSettings();
          return legacySettings;
        }
        return readBrowserClientSettings();
      },
      setClientSettings: async (settings) => {
        if (window.desktopBridge) {
          return window.desktopBridge.setClientSettings(settings);
        }
        writeBrowserClientSettings(settings);
      },
      getRendererState: async (key) => {
        if (window.desktopBridge) {
          const persistedState = await window.desktopBridge.getRendererState(key);
          if (persistedState !== null) {
            return persistedState;
          }

          const legacyState = readValidBrowserRendererState(key);
          if (legacyState === null) {
            return null;
          }
          await window.desktopBridge.setRendererState(key, legacyState);
          window.localStorage.removeItem(rendererStateStorageKeys[key]);
          return legacyState;
        }
        return readValidBrowserRendererState(key);
      },
      setRendererState: async (key, value) => {
        if (window.desktopBridge) {
          return window.desktopBridge.setRendererState(key, value);
        }
        const storageKey = rendererStateStorageKeys[key];
        if (value === null) {
          window.localStorage.removeItem(storageKey);
          return;
        }
        window.localStorage.setItem(storageKey, value);
      },
    },
  };
}

export function createLocalApi(): LocalApi {
  return createBrowserLocalApi();
}

export function readLocalApi(): LocalApi | undefined {
  if (typeof window === "undefined") return undefined;
  if (cachedApi) return cachedApi;

  cachedApi = createLocalApi();
  return cachedApi;
}

export function ensureLocalApi(): LocalApi {
  const api = readLocalApi();
  if (!api) {
    throw new Error("Local API not found");
  }
  return api;
}
