import type { WebAddon } from "../../registry";

import { persistComposerAddon } from "./composer";
import { persistSidebarAddon } from "./sidebar";

const persistAddon = {
  id: "persist",
  composer: persistComposerAddon,
  sidebar: persistSidebarAddon,
} satisfies WebAddon;

export default persistAddon;
