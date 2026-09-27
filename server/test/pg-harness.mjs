/* A throwaway Postgres for the test suite, created and destroyed inside the
   run so `npm test` never needs a database you care about.

   Order of preference:
     1. TEST_DATABASE_URL, if you want to point the suite at a real database
        (a scratch Supabase project, or CI's postgres service container).
     2. A temporary cluster created with the local initdb/pg_ctl binaries.

   Nothing is written outside the temp directory, and the whole cluster is
   deleted on stop, so a test run can never touch a real database by accident. */
import { spawn, execFile } from "node:child_process";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SQL_DIR = path.join(ROOT, "sql");

async function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function have(bin) {
  try { await run("which", [bin]); return true; } catch { return false; }
}

async function applySchema(url) {
  const sql = (await import("postgres")).default;
  const db = sql(url, { max: 1, prepare: false, onnotice: () => {} });
  // Every migration, in order — the throwaway database must match Supabase's
  // shape or the suite silently stops covering whatever the newest file adds.
  for (const f of (await readdir(SQL_DIR)).filter((n) => n.endsWith(".sql")).sort()) {
    await db.unsafe(await readFile(path.join(SQL_DIR, f), "utf8"));
  }
  await db.end();
}

export async function startTestPostgres() {
  if (process.env.TEST_DATABASE_URL) {
    const url = process.env.TEST_DATABASE_URL;
    await applySchema(url);
    console.log("Using TEST_DATABASE_URL.\n");
    return { url, async stop() {} };
  }

  if (!(await have("initdb")) || !(await have("pg_ctl"))) {
    throw new Error(
      "No Postgres available for the tests.\n" +
      "Either install Postgres (brew install postgresql@16) so initdb/pg_ctl are on PATH,\n" +
      "or set TEST_DATABASE_URL to a scratch database you do not mind being written to."
    );
  }

  const dir = await mkdtemp(path.join(tmpdir(), "nrm-pg-"));
  const dataDir = path.join(dir, "data");
  const port = await freePort();

  /* LC_ALL=C is load-bearing on macOS: without it the postmaster aborts with
     "postmaster became multithreaded during startup". unix_socket_directories
     is emptied because a socket path under a temp dir routinely exceeds the
     103-byte limit; TCP on a loopback port sidesteps both problems. */
  const env = { ...process.env, LC_ALL: "C", LANG: "C" };
  await run("initdb", ["-D", dataDir, "-U", "postgres", "--auth=trust"], { env });
  await run("pg_ctl", [
    "-D", dataDir,
    "-o", `-p ${port} -c unix_socket_directories=''`,
    "-l", path.join(dir, "pg.log"),
    "-w", "start",
  ], { env });

  const adminUrl = `postgres://postgres@127.0.0.1:${port}/postgres`;
  const url = `postgres://postgres@127.0.0.1:${port}/normalize`;

  const sql = (await import("postgres")).default;
  const admin = sql(adminUrl, { max: 1, prepare: false, onnotice: () => {} });
  await admin`create database normalize`;
  await admin.end();

  await applySchema(url);
  console.log(`Temporary Postgres up on :${port} (discarded on exit).\n`);

  return {
    url,
    async stop() {
      try { await run("pg_ctl", ["-D", dataDir, "-m", "immediate", "-w", "stop"], { env }); } catch {}
      await rm(dir, { recursive: true, force: true });
    },
  };
}
