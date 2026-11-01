// Starts / finds the mock stack: throwaway Postgres + mock Supabase gateway + the Next.js app.
// Used by start.mjs (long-running) and shot.mjs (reuse a running stack or start one for the run).
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createGateway } from "./gateway.mjs";
import { ROOT, freePort, startPostgres } from "./pg.mjs";
import { loadCatalog } from "./rest.mjs";
import { roleKey } from "./session.mjs";

export const MOCK_DIR = path.join(ROOT, ".mock");
export const STATE_FILE = path.join(MOCK_DIR, "state.json");

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function ping(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000), redirect: "manual" });
    return res.status > 0;
  } catch {
    return false;
  }
}

/** The running stack's state (ports, pids), or null when none is running. */
export async function readRunningStack() {
  let state;
  try {
    state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return null;
  }
  if (!alive(state.pid) || !(await ping(`${state.gateway.url}/__health`))) return null;
  return state;
}

export async function waitFor(url, { timeoutMs = 120_000, intervalMs = 500 } = {}) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await ping(url)) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`timed out waiting for ${url}`);
}

/**
 * @param {{ prod?: boolean, nextPort?: number, noNext?: boolean, echo?: boolean }} options
 * @returns {Promise<{ state: object, stop: () => Promise<void> }>}
 */
export async function startStack({ prod = false, nextPort, noNext = false, echo = false } = {}) {
  fs.mkdirSync(path.join(MOCK_DIR, "shots"), { recursive: true });
  const gatewayLog = fs.createWriteStream(path.join(MOCK_DIR, "gateway.log"), { flags: "w" });
  const nextLog = fs.createWriteStream(path.join(MOCK_DIR, "next.log"), { flags: "w" });
  const log = (message) => {
    gatewayLog.write(`${new Date().toISOString()} ${message}\n`);
    if (echo) console.log(`[mock] ${message}`);
  };

  const stops = [];
  const stop = async () => {
    for (const fn of stops.reverse()) {
      try {
        await fn();
      } catch (error) {
        console.error("[mock] shutdown error:", error);
      }
    }
    stops.length = 0;
    try {
      const current = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
      if (current.pid === process.pid) fs.rmSync(STATE_FILE, { force: true });
    } catch {
      /* none */
    }
    gatewayLog.end();
    nextLog.end();
  };

  try {
    log("starting Postgres, applying stubs + migrations + seed ...");
    const pg = await startPostgres();
    stops.push(() => pg.stop());
    const catalog = await loadCatalog(pg.conn);
    const gateway = await createGateway({ conn: pg.conn, catalog, log });
    stops.push(() => gateway.close());
    log(`gateway on ${gateway.url}`);

    const anonKey = roleKey("anon");
    const serviceKey = roleKey("service_role");
    const state = {
      pid: process.pid,
      startedAt: new Date().toISOString(),
      gateway: { port: gateway.port, url: gateway.url },
      pg: { dir: pg.dir, port: pg.port, conn: pg.conn },
      anonKey,
      serviceKey,
      next: null,
      prod,
      logs: { gateway: path.join(MOCK_DIR, "gateway.log"), next: path.join(MOCK_DIR, "next.log") },
    };
    const write = () => fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    write();

    if (!noNext) {
      const port = nextPort ?? (await freePort());
      const siteUrl = `http://127.0.0.1:${port}`;
      const env = {
        ...process.env,
        NODE_ENV: undefined,
        NEXT_TELEMETRY_DISABLED: "1",
        MOCK_MODE: "1",
        NEXT_PUBLIC_SITE_URL: siteUrl,
        NEXT_PUBLIC_SUPABASE_URL: gateway.url,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
        SUPABASE_SERVICE_ROLE_KEY: serviceKey,
        ANTHROPIC_API_KEY: "mock-not-used",
        ANTHROPIC_MODEL_EXTRACT: "mock",
        ANTHROPIC_MODEL_ASSISTANT: "mock",
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: "BNbxGYNMhEIi9zrneh7mqV4oUanjLM2Kd4BMM6hrGGEb4tLKKRyKRdrAefvQ_4cQFfycx-5ekm6VSIsWuLDLoWw",
      };
      delete env.NODE_ENV;
      delete env.VERCEL_ENV;
      const nextBin = path.join(ROOT, "node_modules/next/dist/bin/next");
      const run = (args) =>
        new Promise((resolve, reject) => {
          const child = spawn(process.execPath, [nextBin, ...args], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"], detached: true });
          const pipe = (d) => {
            nextLog.write(d);
            if (echo) process.stdout.write(d);
          };
          child.stdout.on("data", pipe);
          child.stderr.on("data", pipe);
          child.on("error", reject);
          child.on("exit", (code) => (code === 0 ? resolve(child) : reject(new Error(`next ${args[0]} exited with ${code}; see .mock/next.log`))));
        });
      if (prod) {
        log("next build ...");
        await run(["build"]);
      }
      const child = spawn(process.execPath, [nextBin, prod ? "start" : "dev", "-p", String(port), "-H", "127.0.0.1"], {
        cwd: ROOT,
        env,
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
      });
      const pipe = (d) => {
        nextLog.write(d);
        if (echo) process.stdout.write(d);
      };
      child.stdout.on("data", pipe);
      child.stderr.on("data", pipe);
      stops.push(async () => {
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch {
          /* gone */
        }
        await new Promise((r) => setTimeout(r, 300));
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          /* gone */
        }
      });
      state.next = { port, url: siteUrl, pid: child.pid };
      await waitFor(`${siteUrl}/login`);
      log(`next ${prod ? "start" : "dev"} on ${siteUrl}`);
      write();
    }
    return { state, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}
