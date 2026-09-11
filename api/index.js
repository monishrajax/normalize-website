/**
 * Vercel Serverless Function — API adapter.
 *
 * Vercel routes every /api/* request here. This file:
 *   1. Connects to MongoDB once per warm instance (connection is reused
 *      across invocations while the function stays warm).
 *   2. Exports the Express app so @vercel/node can handle each request.
 *
 * Note: this file lives at the repo root so Vercel's build picks it up
 * automatically. It imports from server/src/ via a relative path — no
 * separate build step is needed because @vercel/node bundles it with esbuild.
 */

import mongoose from "mongoose";
import { createApp } from "../server/src/index.js";

/* Keep the MongoDB connection alive across warm invocations. Serverless
   functions share the same Node process while warm, so connecting once is
   enough. A fresh connection is made after a cold start. */
let connected = false;

async function ensureDb() {
  if (connected && mongoose.connection.readyState === 1) return;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set in Vercel environment variables.");
  await mongoose.connect(uri);
  connected = true;
}

const app = createApp();

export default async function handler(req, res) {
  /* A failure here used to reject the handler, which Vercel surfaces as an
     opaque FUNCTION_INVOCATION_FAILED with no hint of the cause — the browser
     shows a 500 and the reason is only visible in the dashboard logs. Catching
     it turns a missing MONGODB_URI or an unreachable cluster into a clean,
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
