/* Applies every file in server/sql/ to whatever DATABASE_URL points at.

   Run with:  npm run migrate        (from server/, reads server/.env)
   or:        DATABASE_URL='...' node src/migrate.js

   The schema is written to be idempotent — every statement is `if not exists`,
   `or replace`, or guarded — so running this twice is safe and running it
   against an already-seeded database will not touch the data. */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, closeDb } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/* Every .sql file, in filename order — 001, then 002, and so on. Naming a
   single file here meant adding a migration and then wondering why the schema
   on a fresh database was missing half of it. */
const dir = path.join(__dirname, "..", "sql");
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Put it in server/.env, or pass it inline:");
  console.error("  DATABASE_URL='postgres://...' node src/migrate.js");
  process.exit(1);
}

const sql = db();
try {
  for (const f of files) {
    process.stdout.write(`  applying ${f} ... `);
    await sql.unsafe(await readFile(path.join(dir, f), "utf8"));
    console.log("ok");
  }

  const [{ count: tables }] = await sql`
    select count(*)::int as count from information_schema.tables
    where table_schema = 'public' and table_name in ('products','orders')
  `;
  const rls = await sql`
    select relname, relrowsecurity from pg_class
    where relname in ('products','orders') order by relname
  `;

  console.log(`Schema applied. Tables present: ${tables}/2`);
  for (const t of rls) {
    console.log(`  ${t.relname.padEnd(9)} RLS ${t.relrowsecurity ? "enabled" : "OFF — check the migration"}`);
  }
  console.log("\nNext: npm run seed");
} catch (err) {
  console.error("Migration failed:", err.message);
  process.exitCode = 1;
} finally {
  await closeDb();
}
