import * as Schema from "effect/Schema";
import { TrimmedNonEmptyString } from "./baseSchemas.ts";

export const PersistContextReceipt = Schema.Struct({
  injectionId: TrimmedNonEmptyString,
  providerSessionId: TrimmedNonEmptyString,
  stage: Schema.Literals(["accepted", "provider-adopted", "indeterminate"]),
  acceptedAt: Schema.String,
  adoptedAt: Schema.NullOr(Schema.String),
  injected: Schema.Boolean,
  modelConsumption: Schema.Literal("unproven"),
});
export type PersistContextReceipt = typeof PersistContextReceipt.Type;

export const PersistContextCapabilities = Schema.Struct({
  supported: Schema.Boolean,
  providerSessionId: Schema.NullOr(Schema.String),
  startsTurn: Schema.Literal(false),
  timing: Schema.Literal("next-model-request"),
  modelConsumption: Schema.Literal("unproven"),
});
