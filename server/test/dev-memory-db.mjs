/* Runs the real server against a throwaway in-memory MongoDB.

   Run with:  npm run dev:memory      (from server/, or `npm run dev:memory` at the root)

   For trying the site before you have a database set up. Everything is real
   except the storage: the catalogue is seeded fresh on each boot and vanishes
   when you stop the process, so never use this for anything you want to keep.
   Razorpay still runs in test mode against the keys in the environment. */
import { MongoMemoryServer } from "mongodb-memory-server";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const mongo = await MongoMemoryServer.create();
console.log("Temporary in-memory MongoDB started (data is discarded on exit).\n");

const env = {
  ...process.env,
  MONGODB_URI: mongo.getUri("normalize"),
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
  await mongo.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
