import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";

import productRoutes from "./routes/products.js";
import orderRoutes from "./routes/orders.js";
import trackingRoutes from "./routes/tracking.js";
import configRoutes from "./routes/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ---------------------------------------------------------------------------
   createApp — builds and returns the configured Express application.
   Exported so the Vercel serverless adapter (api/index.js) can import it
   without also triggering mongoose.connect / app.listen.
--------------------------------------------------------------------------- */
export function createApp() {
  const app = express();

  app.set("trust proxy", 1);   // correct client IPs behind a host's proxy

  /* Without an explicit origin this would fall back to "*", letting any site on
     the internet call these endpoints from a visitor's browser. */
  const ORIGINS = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
    .split(",").map((s) => s.trim()).filter(Boolean);
  app.use(cors({ origin: ORIGINS, credentials: true }));

  /* The Razorpay webhook signature is computed over the exact bytes of the
     request, so that one route must NOT have its body parsed into an object
     first — it mounts its own express.raw(). Everything else gets JSON. */
  app.use((req, res, next) => {
    if (req.originalUrl === "/api/orders/webhook") return next();
    express.json({ limit: "100kb" })(req, res, next);
  });

  /* The old serverless functions had no rate limiting at all: anyone could hammer
     create-order and mint unlimited Razorpay orders. */
  app.use("/api", rateLimit({
    windowMs: 60_000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests. Please slow down." },
  }));

  /* Payment endpoints get a tighter budget than browsing. Two things are
     deliberately exempt: Razorpay's webhook, which retries on any non-2xx and
     must never be throttled, and GET status lookups — a customer refreshing
     their confirmation page is not a payment attempt and shouldn't burn the
     budget that protects order creation. */
  app.use("/api/orders", rateLimit({
    windowMs: 60_000,
    max: 30,
    skip: (req) => req.path === "/webhook" || req.method === "GET",
    message: { error: "Too many attempts. Please wait a moment." },
  }));

  app.get("/api/health", (req, res) => res.json({ ok: true, uptime: process.uptime() }));
  app.use("/api/products", productRoutes);
  app.use("/api/orders", orderRoutes);
  app.use("/api/track", trackingRoutes);
  app.use("/api/config", configRoutes);

  /* In production (standalone Node server) the built React bundle is served
     from the same origin, which removes the CORS question entirely.
     On Vercel, static assets are served by Vercel's CDN — this block is skipped. */
  if (process.env.NODE_ENV === "production" && process.env.VERCEL !== "1") {
    const dist = path.join(__dirname, "../../client/dist");
    app.use(express.static(dist));
    app.get("*", (req, res) => res.sendFile(path.join(dist, "index.html")));
  }

  app.use((req, res) => res.status(404).json({ error: "Not found." }));

  // Never leak a stack trace or a driver message to the browser.
  app.use((err, req, res, next) => {
    console.error("Unhandled error:", err);
    res.status(err.status || 500).json({ error: "Something went wrong. Please try again." });
  });

  return app;
}

/* ---------------------------------------------------------------------------
   start — connects to MongoDB then starts the HTTP server.
   Only called when this file is the process entry point (local dev / `npm start`).
--------------------------------------------------------------------------- */
async function start() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set. Copy server/.env.example to server/.env.");
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log("MongoDB connected.");

  const PORT = process.env.PORT || 5050;
  const app = createApp();
  const server = app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      // Port 5000 is held by Control Center (AirPlay Receiver) on macOS, which
      // is why the default here is 5050 — but say so plainly either way.
      console.error(
        `\nPort ${PORT} is already in use.\n` +
        `Either stop whatever is holding it (lsof -nP -iTCP:${PORT} -sTCP:LISTEN)\n` +
        `or set a different PORT in server/.env — and update the Vite proxy in\n` +
        `client/vite.config.js to match.\n`
      );
      process.exit(1);
    }
    throw err;
  });
}

start().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
