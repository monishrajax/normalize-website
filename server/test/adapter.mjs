/* The serverless adapter (api/index.js), run for real under each condition the
   live site can find itself in.

   Run with:  npm run test:adapter      (from server/)

   Needs a local Postgres (initdb/pg_ctl on PATH), the same as `npm test`, but NO
   Razorpay keys and no network. The adapter keeps its state in module variables,
   so every scenario runs in its own child process — exactly as every cold
   start does on Vercel.

   The case that matters most is the last: the database is away, then comes back
   at the SAME address, which is what restoring a paused Supabase project does.
   A small TCP relay in this file plays the database's address, so it can be
   refused and then opened without the adapter's URL ever changing. */
import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { startTestPostgres } from "./pg-harness.mjs";

const HERE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(HERE), "..");

/* ---- child mode: the adapter behind a plain HTTP server ------------------- */
if (process.argv[2] === "--serve") {
  const { default: handler } = await import(pathToFileURL(path.join(ROOT, "..", "api", "index.js")).href);
  const server = http.createServer(handler).listen(0, "127.0.0.1", () =>
    console.log(`PORT=${server.address().port}`)
  );
} else {
  await main();
}

async function main() {
  let failures = 0;
  const check = (label, ok, detail) => {
    console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${!ok && detail ? "  → " + detail : ""}`);
    if (!ok) failures++;
  };

  const children = [];
  async function serve(env) {
    const child = spawn(process.execPath, [HERE, "--serve"], {
      // A clean environment: nothing from the developer's shell or server/.env
      // may leak in and change which scenario this is.
      env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.push(child);
    let log = "";
    child.stderr.on("data", (d) => { log += d; });
    const port = await new Promise((resolve, reject) => {
      let out = "";
      child.stdout.on("data", (d) => {
        out += d;
        log += d;                      // console.log goes to stdout, console.error to stderr
        const m = out.match(/PORT=(\d+)/);
        if (m) resolve(Number(m[1]));
      });
      child.once("exit", (code) => reject(new Error(`adapter child exited (${code}): ${log}`)));
    });
    return {
      base: `http://127.0.0.1:${port}`,
      log: () => log,
    };
  }

  const get = async (base, p, init) => {
    const res = await fetch(base + p, init);
    return { res, body: await res.json().catch(() => null) };
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  /* A port nothing is listening on. */
  const closedPort = await new Promise((resolve) => {
    const s = net.createServer().listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

  const pg = await startTestPostgres();
  let relay;

  try {
    // The real catalogue, seeded the way `npm run seed` does it.
    await new Promise((resolve, reject) =>
      spawn(process.execPath, ["src/seed.js"], { cwd: ROOT, env: { PATH: process.env.PATH, DATABASE_URL: pg.url }, stdio: "ignore" })
        .on("exit", (code) => (code === 0 ? resolve() : reject(new Error("seed failed"))))
    );

    console.log("\nDatabase address refuses connections (a paused project)");
    {
      const a = await serve({ DATABASE_URL: `postgres://nobody:x@127.0.0.1:${closedPort}/normalize`, API_DB_RETRY_MS: "300" });
      const products = await get(a.base, "/api/products");
      const tote = products.body?.products?.find((p) => p.slug === "butterfly-tote");
      check("the shop still lists its products", products.res.status === 200 && products.body.products.length === 12, `${products.res.status}`);
      check("…including the Butterfly Tote, paused rather than gone", tote?.paused === true && tote?.isSellable === false && tote?.price === 799);
      check("…and says it is the window display", products.res.headers.get("x-normalize-mode") === "window-display");
      check("config carries the pause", (await get(a.base, "/api/config")).body?.ordering === "paused");
      check("an order is refused, not attempted", (await get(a.base, "/api/orders", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).res.status === 503);
      const health = await get(a.base, "/api/health");
      check("health says degraded, with a reason", health.res.status === 503 && health.body?.degraded === true && health.body.detail.length > 0, JSON.stringify(health.body));
      check("the failure went to the log, once, not on every request",
        (a.log().match(/Database unreachable/g) || []).length === 1, `${(a.log().match(/Database unreachable/g) || []).length}`);
    }

    console.log("\nDATABASE_URL not set at all");
    {
      const a = await serve({});
      const products = await get(a.base, "/api/products");
      check("the shop still lists its products", products.res.status === 200 && products.body.products.length === 12);
      const health = await get(a.base, "/api/health");
      check("health names the missing setting", /DATABASE_URL/.test(health.body?.detail || ""), health.body?.detail);
    }

    console.log("\nDatabase healthy");
    {
      const a = await serve({ DATABASE_URL: pg.url });
      const products = await get(a.base, "/api/products");
      const tote = products.body?.products?.find((p) => p.slug === "butterfly-tote");
      check("the full API answers, from the database", products.res.status === 200 && products.res.headers.get("x-normalize-mode") === null);
      check("…with real uuid ids and the tote on sale", UUID.test(tote?.id || "") && tote?.isSellable === true && !("paused" in tote) && !("window" in tote));
      const health = await get(a.base, "/api/health");
      check("health is ok", health.res.status === 200 && health.body.ok === true);
      check("config has no pause", (await get(a.base, "/api/config")).body?.ordering === undefined);
    }

    console.log("\nDatabase away, then back at the same address (a project being restored)");
    {
      const pgUrl = new URL(pg.url);
      let open = false;
      relay = net.createServer((client) => {
        if (!open) return client.destroy();
        const upstream = net.connect(Number(pgUrl.port), pgUrl.hostname);
        client.pipe(upstream).pipe(client);
        const end = () => { client.destroy(); upstream.destroy(); };
        client.on("error", end); upstream.on("error", end);
        client.on("close", end); upstream.on("close", end);
      }).listen(0, "127.0.0.1");
      await new Promise((r) => relay.once("listening", r));
      const url = `postgres://${pgUrl.username}@127.0.0.1:${relay.address().port}${pgUrl.pathname}`;

      const a = await serve({ DATABASE_URL: url, API_DB_RETRY_MS: "500" });

      const before = await get(a.base, "/api/products");
      check("while it is away: the window", before.res.headers.get("x-normalize-mode") === "window-display" && before.body.products.length === 12);
      const again = await get(a.base, "/api/products");
      check("…and straight away again, without asking the database a second time",
        again.res.headers.get("x-normalize-mode") === "window-display" && (a.log().match(/Database unreachable/g) || []).length === 1);

      open = true;                       // the project is restored
      await wait(700);                   // …and the retry window passes

      const after = await get(a.base, "/api/products");
      const tote = after.body?.products?.find((p) => p.slug === "butterfly-tote");
      check("once it is back: the full API again, with no redeploy",
        after.res.headers.get("x-normalize-mode") === null && UUID.test(tote?.id || "") && tote?.isSellable === true, `${after.res.status}`);
      check("health recovers too", (await get(a.base, "/api/health")).res.status === 200);
      check("the recovery was logged", /reachable again/.test(a.log()));
    }
  } finally {
    for (const c of children) c.kill();
    relay?.close();
    await pg.stop();
  }

  console.log(failures ? `\n${failures} check(s) FAILED.\n` : "\nAll checks passed.\n");
  process.exit(failures ? 1 : 0);
}
