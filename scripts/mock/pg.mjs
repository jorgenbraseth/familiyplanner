// Throwaway Postgres for the mock stack: start/stop a temp cluster, run SQL through psql.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function pgBin() {
  if (process.env.PGBIN) return process.env.PGBIN;
  const base = "/usr/lib/postgresql";
  const versions = fs.existsSync(base) ? fs.readdirSync(base).sort((a, b) => Number(a) - Number(b)) : [];
  if (versions.length === 0) throw new Error("PostgreSQL binaries not found; set PGBIN");
  return path.join(base, versions[versions.length - 1], "bin");
}

export function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** Connection URI for psql over the cluster's unix socket. */
export function connString({ dir, port }) {
  return `postgresql://postgres@/postgres?host=${encodeURIComponent(dir)}&port=${port}`;
}

/** Runs one SQL script through psql (stdin). Resolves { code, stdout, stderr }. */
export function runPsql(conn, sql, { fileMode = false } = {}) {
  return new Promise((resolve, reject) => {
    const args = ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-v", "SHOW_CONTEXT=never", conn];
    const child = spawn("psql", args, { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, PGCLIENTENCODING: "UTF8" } });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (d) => (stdout += d));
    child.stderr.setEncoding("utf8").on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    child.stdin.on("error", () => {});
    child.stdin.end(sql);
    void fileMode;
  });
}

async function runFile(conn, file) {
  const result = await runPsql(conn, fs.readFileSync(file, "utf8"));
  if (result.code !== 0) throw new Error(`${path.relative(ROOT, file)} failed:\n${result.stderr}`);
}

/** Starts a temp cluster (as `postgres` via runuser when run as root). Returns { dir, port, conn, stop }. */
export async function startPostgres() {
  const bin = pgBin();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "family-mock-pg-"));
  fs.chmodSync(dir, 0o755);
  const run = [];
  if (process.getuid && process.getuid() === 0) {
    const chown = spawnSync("chown", ["postgres", dir]);
    if (chown.status !== 0) throw new Error("could not chown the Postgres directory to the postgres user");
    run.push("runuser", "-u", "postgres", "--");
  }
  const exec = (cmd, args) => {
    const [bin0, ...rest] = [...run, cmd];
    const r = spawnSync(bin0, [...rest, ...args], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`${cmd} failed: ${r.stderr || r.stdout}`);
  };
  exec(path.join(bin, "initdb"), ["-D", path.join(dir, "data"), "-U", "postgres", "--auth=trust", "-E", "UTF8", "--locale=C.UTF-8"]);
  const port = await freePort();
  exec(path.join(bin, "pg_ctl"), [
    "-D", path.join(dir, "data"), "-w", "-l", path.join(dir, "log"),
    "-o", `-p ${port} -k ${dir} -c listen_addresses='' -c timezone=UTC -c fsync=off -c synchronous_commit=off -c full_page_writes=off`,
    "start",
  ]);
  const conn = connString({ dir, port });
  const stop = () => {
    try {
      exec(path.join(bin, "pg_ctl"), ["-D", path.join(dir, "data"), "-m", "immediate", "stop"]);
    } catch {
      /* already stopped */
    }
    fs.rmSync(dir, { recursive: true, force: true });
  };
  try {
    await runFile(conn, path.join(ROOT, "supabase/mock/stubs.sql"));
    const migrations = fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
    for (const f of migrations) await runFile(conn, path.join(ROOT, "supabase/migrations", f));
    await runFile(conn, path.join(ROOT, "supabase/mock/seed.sql"));
  } catch (error) {
    stop();
    throw error;
  }
  return { dir, port, conn, stop };
}
