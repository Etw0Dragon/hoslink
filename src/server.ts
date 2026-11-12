import { serve } from "@hono/node-server";
import { readConfig } from "./config.js";
import { database } from "./db/index.js";
import { createAuth } from "./auth.js";
import { createApp } from "./app.js";
import { reconcile } from "./partnerships.js";
const cfg = readConfig(),
  { pool, db } = database(cfg.DATABASE_URL);
await pool.query("SELECT 1 FROM schema_migrations LIMIT 1");
await reconcile(pool);
const app = createApp(pool, createAuth(cfg, db), cfg);
const server = serve({ fetch: app.fetch, port: cfg.PORT, hostname: "0.0.0.0" });
let running = false;
const worker = setInterval(async () => {
  if (running) return;
  running = true;
  try {
    await reconcile(pool);
    await pool.query("DELETE FROM tokens WHERE expires_at<now()");
  } catch {
    console.error("capacity reconciliation failed");
  } finally {
    running = false;
  }
}, 60000);
worker.unref();
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  clearInterval(worker);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 15000).unref();
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
