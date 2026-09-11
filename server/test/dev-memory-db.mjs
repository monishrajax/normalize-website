/* Runs the real server against a throwaway Postgres.

   Run with:  npm run dev:memory      (from server/, or at the repo root)

   For trying the site before you have a Supabase project set up. Everything is
   real except the storage: the schema is applied and the catalogue seeded fresh
   on each boot, and the whole database is discarded when you stop the process —
   so never use this for anything you want to keep. Razorpay still runs in test
   mode against the keys in the environment. */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startTestPostgres } from "./pg-harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const pg = await startTestPostgres();

const env = {
  ...process.env,
  DATABASE_URL: pg.url,
  PORT: process.env.PORT || "5050",
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  // Read from server/.env — never hardcoded, so this file is safe to commit.
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
  SHIPROCKET_CREATE_ON_PAYMENT: process.env.SHIPROCKET_CREATE_ON_PAYMENT || "false",
  SHIPPING_FEE: process.env.SHIPPING_FEE || "199",
  FREE_SHIPPING_THRESHOLD: process.env.FREE_SHIPPING_THRESHOLD || "1499",
};

await new Promise((resolve, reject) =>
  spawn("node", ["src/seed.js"], { cwd: ROOT, env, stdio: "inherit" })
    .on("exit", (code) => (code === 0 ? resolve() : reject(new Error("seed failed"))))
);

const server = spawn("node", ["src/index.js"], { cwd: ROOT, env, stdio: "inherit" });

const shutdown = async () => {
  server.kill();
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
server.on("exit", shutdown);
