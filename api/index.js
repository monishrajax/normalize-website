/**
 * Vercel Serverless Function — API adapter.
 *
 * Vercel routes every /api/* request here. This file:
 *   1. Verifies the Postgres pool is reachable once per warm instance.
 *   2. Exports the Express app so @vercel/node can handle each request.
 *
 * Note: this file lives at the repo root so Vercel's build picks it up
 * automatically. It imports from server/src/ via a relative path — no
 * separate build step is needed because @vercel/node bundles it with esbuild.
 */

import { createApp } from "../server/src/index.js";
import { pingDb } from "../server/src/db.js";

/* postgres.js manages its own pool and reconnects on its own, so there is no
   connection to hold open by hand here — the pool lives in server/src/db.js and
   is reused for as long as the instance stays warm. What this still owes the
   caller is a fast, loud failure when the database is unreachable, so a cold
   start checks once rather than letting the first customer request discover it. */
let verified = false;

async function ensureDb() {
  if (verified) return;
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set in Vercel environment variables.");
  }
  await pingDb();
  verified = true;
}

const app = createApp();

export default async function handler(req, res) {
  /* A failure here used to reject the handler, which Vercel surfaces as an
     opaque FUNCTION_INVOCATION_FAILED with no hint of the cause — the browser
     shows a 500 and the reason is only visible in the dashboard logs. Catching
     it turns a missing DATABASE_URL or an unreachable database into a clean,
     readable 503, with the real error still logged for the function log. */
  try {
    await ensureDb();
  } catch (err) {
    console.error("Database connection failed:", err);
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({
      error: "The store is temporarily unavailable. Please try again shortly.",
    }));
  }
  // Delegate the request to the Express app.
  return app(req, res);
}
