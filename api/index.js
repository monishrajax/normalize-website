/**
 * Vercel Serverless Function — API adapter.
 *
 * Vercel routes every /api/* request here.
 *
 * WHY THE IMPORTS ARE DYNAMIC:
 *
 * A static `import` that fails — a dependency missing from the function bundle,
 * a syntax error, a module that throws while initialising — kills the function
 * before any code in this file runs. Vercel reports that as a bare
 * FUNCTION_INVOCATION_FAILED with no cause, identical for every route, and the
 * only way to learn more is the dashboard's runtime logs. That is exactly the
 * wall this project hit in production.
 *
 * Loading the app inside the handler puts every failure — import, connection,
 * or otherwise — inside a try/catch that can answer with a readable message and
 * log the real error. The cost is one dynamic import on a cold start, which is
 * cached for the life of the instance.
 */

let bootPromise = null;

async function boot() {
  const [serverModule, dbModule] = await Promise.all([
    import("../server/src/index.js"),
    import("../server/src/db.js"),
  ]);

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set in Vercel environment variables.");
  }
  // Fail loudly at boot rather than letting the first customer request find out.
  await dbModule.pingDb();

  return serverModule.createApp();
}

export default async function handler(req, res) {
  let app;
  try {
    // postgres.js manages its own pool and reconnects on its own, so the app is
    // built once and reused for as long as the instance stays warm.
    bootPromise ??= boot();
    app = await bootPromise;
  } catch (err) {
    // Let the next invocation try again — a database that was briefly
    // unreachable should not poison the instance for its whole lifetime.
    bootPromise = null;
    console.error("API failed to start:", err);
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({
      error: "The store is temporarily unavailable. Please try again shortly.",
      // Safe to expose: this is our own message, never a driver dump, and it is
      // the difference between a five-minute fix and an afternoon of guessing.
      detail: String(err?.message || err).slice(0, 200),
    }));
  }
  return app(req, res);
}
