import type { WebAddon } from "../../registry";

import { persistComposerAddon } from "./composer";
import { PersistLifecycle } from "./lifecycle";
import { persistSidebarAddon } from "./sidebar";

const persistAddon = {
  id: "persist",
  Lifecycle: PersistLifecycle,
  composer: persistComposerAddon,
  sidebar: persistSidebarAddon,
} satisfies WebAddon;

export default persistAddon;
