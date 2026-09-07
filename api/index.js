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
  await ensureDb();
  // Delegate the request to the Express app.
  return app(req, res);
}
