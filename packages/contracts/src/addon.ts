import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";

/** Generic server-side action boundary for build-time addons. */
export const ServerAddonActionInput = Schema.Struct({
  addonId: TrimmedNonEmptyString,
  actionId: TrimmedNonEmptyString,
  payload: Schema.Unknown,
});
export type ServerAddonActionInput = typeof ServerAddonActionInput.Type;

export const ServerAddonActionResult = Schema.Struct({ payload: Schema.Unknown });
export type ServerAddonActionResult = typeof ServerAddonActionResult.Type;

export class ServerAddonActionError extends Schema.TaggedErrorClass<ServerAddonActionError>()(
  "ServerAddonActionError",
  {
    addonId: TrimmedNonEmptyString,
    actionId: TrimmedNonEmptyString,
    message: TrimmedNonEmptyString,
  },
) {}
