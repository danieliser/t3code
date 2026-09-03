import type { WebAddon } from "../../registry";

const threadLabelsAddon = {
  id: "thread-labels",
} satisfies WebAddon;

export default threadLabelsAddon;

export { threadLabelApi } from "./api";
export type { ThreadLabelApi, ThreadLabelApiSnapshot } from "./api";
