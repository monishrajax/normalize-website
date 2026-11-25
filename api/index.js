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
 *
 * WHEN THE DATABASE IS AWAY — THE WINDOW DISPLAY:
 *
 * The database used to be a hard dependency of everything: with it down, every
 * route returned 503 and the storefront showed "0 pieces" — the whole shop,
 * Butterfly Tote included, vanished because a Supabase project had been paused.
 * Now only the part that genuinely needs the database fails. While it cannot be
 * reached, the API answers with the window display (server/src/routes/window.js):
 * the catalogue, read from the same file the seed script loads, every piece
 * marked as not orderable. Orders, payments, accounts and tracking still 503.
 *
 * It heals on its own. A failed check is trusted for RETRY_MS and then the
 * database is asked again by whichever request arrives next; the first time it
 * answers, this instance switches to the full API for good. Nobody has to
 * redeploy after restoring a paused project.
 *
 * Two kinds of failure are kept apart on purpose. If the CODE will not load,
 * there is nothing to fall back on and the answer is the plain 503 it always
 * was. Only a database that will not answer earns the window.
 */

const RETRY_MS = Number(process.env.API_DB_RETRY_MS || 30_000);
const PING_MS = 4_000;       // longer than this and the database counts as away

let modules = null;          // { serverModule, dbModule } once both have imported
let real = null;             // the full API, once the database has answered
let checking = null;         // a database check in flight, shared by concurrent requests
let retryAt = 0;             // until then a recent failure is trusted
let lastFailure = "";        // why, for /api/health
let windowApp = null;

async function load() {
  const [serverModule, dbModule] = await Promise.all([
    import("../server/src/index.js"),
    import("../server/src/db.js"),
  ]);
  return { serverModule, dbModule };
}

function within(promise, ms, message) {
  let timer;
  const clock = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); });
  return Promise.race([promise, clock]).finally(() => clearTimeout(timer));
}

/* Resolves to the full app when the database answers, or null when it does not.
   Rejects only when the code itself cannot be loaded. */
async function attempt() {
  // A failed import is not a database problem, so it is allowed to throw: the
  // handler answers it with the plain 503, and the next request tries again.
  modules ??= await load();
  const { serverModule, dbModule } = modules;

  try {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set in Vercel environment variables.");
    }
    // postgres.js manages its own pool and reconnects on its own, so a database
    // that was briefly away needs nothing from us once it is back.
    await within(dbModule.pingDb(), PING_MS, "The database did not answer in time.");
  } catch (err) {
    retryAt = Date.now() + RETRY_MS;
    lastFailure = String(err?.message || err).slice(0, 200);
    console.error("Database unreachable — serving the window display:", err);
    return null;
  }

  if (lastFailure) console.log("Database is reachable again — serving the full API.");
  lastFailure = "";
  real = serverModule.createApp();
  return real;
}

async function ensureApp() {
  if (real) return real;
  if (Date.now() < retryAt) return null;
  checking ??= attempt().finally(() => { checking = null; });
  return checking;
}

export default async function handler(req, res) {
  let app;
  try {
    app = await ensureApp();
  } catch (err) {
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

  if (app) return app(req, res);

  windowApp ??= modules.serverModule.createWindowApp({ why: () => lastFailure });
  return windowApp(req, res);
}
