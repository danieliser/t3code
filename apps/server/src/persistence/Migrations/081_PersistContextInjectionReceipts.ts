import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    CREATE TABLE persist_context_injections (
      thread_id TEXT NOT NULL,
      injection_id TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      provider_session_id TEXT NOT NULL,
      stage TEXT NOT NULL CHECK (stage IN ('accepted', 'provider-adopted', 'indeterminate')),
      accepted_at TEXT NOT NULL,
      adopted_at TEXT,
      PRIMARY KEY (thread_id, injection_id)
    )
  `;
});
