import {
  PersistFleetAgentRegistrationInput,
  ServerAddonActionError,
  type ServerAddonActionInput,
  type ServerAddonActionResult,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { registerPersistFleetAgent } from "./persist/PersistFleetActions.ts";

const decodePersistRegistration = Schema.decodeUnknownEffect(PersistFleetAgentRegistrationInput);

/**
 * Build-time server addon registry. Core transports expose only this generic
 * action boundary; addon-owned modules keep their protocol and behavior out of
 * the websocket router.
 */
export function executeServerAddonAction(input: ServerAddonActionInput) {
  if (input.addonId === "persist" && input.actionId === "fleet.agent.upsert") {
    return decodePersistRegistration(input.payload).pipe(
      Effect.mapError(
        () =>
          new ServerAddonActionError({
            addonId: input.addonId,
            actionId: input.actionId,
            message: "Invalid PERSIST fleet registration payload.",
          }),
      ),
      Effect.flatMap(registerPersistFleetAgent),
      Effect.map((payload): ServerAddonActionResult => ({ payload })),
    );
  }
  return Effect.fail(
    new ServerAddonActionError({
      addonId: input.addonId,
      actionId: input.actionId,
      message: `Unknown server addon action: ${input.addonId}/${input.actionId}.`,
    }),
  );
}
