import postgres from "postgres";

/* The single Postgres connection, shared by every query in the server.

   SUPABASE + SERVERLESS, the two settings that matter:

   `prepare: false` is REQUIRED when the connection string points at Supabase's
   transaction-mode pooler (Supavisor, port 6543). In transaction mode a
   connection is handed to a different client between statements, so a prepared
   statement created on one is gone by the time it is executed — the symptom is
   an intermittent "prepared statement ... does not exist" under load, which is
   miserable to debug. Turning prepares off costs a little planning time and
   makes the pooler safe.

   `max: 1` because each Vercel function instance handles one request at a time.
   A larger pool per instance just multiplies idle connections across however
   many instances are warm, and Supabase's connection budget is finite. */
const url = process.env.DATABASE_URL;

let sql = null;

export function db() {
  if (sql) return sql;
  if (!url) throw new Error("DATABASE_URL is not set.");
  sql = postgres(url, {
    max: Number(process.env.PG_POOL_MAX || 1),
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
    // Supabase requires TLS; a local dev cluster has none. Decided from the
    // URL rather than from NODE_ENV so `npm test` against a throwaway local
    // Postgres behaves the same way in CI as it does on a laptop.
    ssl: /supabase|sslmode=require/i.test(url) ? "require" : false,
    onnotice: () => {},          // schema NOTICEs are not application logs
    /* snake_case in the database, camelCase in JavaScript, converted at the
       boundary. Verified that this touches COLUMN NAMES only — jsonb contents
       pass through untouched, which matters because `images` is keyed by
       variant ("Dawn", "Dusk") and those keys must survive verbatim. */
    transform: postgres.camel,
  });
  return sql;
}

/* Cheap liveness check — used by start() and by the serverless adapter so a
   misconfigured DATABASE_URL fails loudly at boot instead of on the first
   customer request. */
export async function pingDb() {
  await db()`select 1`;
}

export async function closeDb() {
  if (!sql) return;
  await sql.end({ timeout: 5 });
  sql = null;
}
