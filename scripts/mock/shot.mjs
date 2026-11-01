// `npm run shot` - screenshots of app pages from the mock stack (docs/MOCK.md).
//   npm run shot -- --as Emma --path / --viewport phone --out .mock/shots/home.png [--full-page]
//                   [--session-id <uuid>] [--screen] [--wait-for <selector>] [--scale 2]
//   npm run shot -- --config shots.json     (array of the same options, or { "defaults": {...}, "shots": [...] })
// Reuses a running stack (.mock/state.json) or starts one for the run and stops it afterwards.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { ROOT, runPsql } from "./pg.mjs";
import { MOCK_DIR, readRunningStack, startStack, waitFor } from "./stack.mjs";
import { authCookies, emailFor, mintSession, parseArgs } from "./session.mjs";
import { resolveViewport, shotFileName } from "./shot-lib.mjs";

const require = createRequire(import.meta.url);

function normalize(raw) {
  return {
    as: raw.as,
    path: raw.path ?? "/",
    viewport: raw.viewport ?? "phone",
    out: raw.out ?? null,
    fullPage: raw.fullPage === true || raw.fullPage === "true",
    sessionId: raw.sessionId ?? null,
    screen: raw.screen === true || raw.screen === "true",
    waitFor: raw.waitFor ?? null,
    scale: raw.scale ? Number(raw.scale) : 1,
    anonymous: raw.anonymous === true || raw.as === undefined,
  };
}

const args = parseArgs(process.argv.slice(2), ["fullPage", "screen", "keep"]);
let shots;
if (args.config) {
  const parsed = JSON.parse(fs.readFileSync(path.resolve(args.config), "utf8"));
  const defaults = Array.isArray(parsed) ? {} : (parsed.defaults ?? {});
  shots = (Array.isArray(parsed) ? parsed : parsed.shots).map((s) => normalize({ ...defaults, ...s }));
} else {
  shots = [normalize(args)];
}
if (args.outDir) shots.forEach((s) => (s.outDir = args.outDir));

let stack = null;
let started = false;
let exitCode = 0;
try {
  const running = await readRunningStack();
  if (running?.next) {
    stack = { state: running, stop: async () => {} };
    console.log(`Using the running mock stack at ${running.next.url}`);
  } else {
    console.log("No running mock stack: starting one for this run ...");
    stack = await startStack({});
    started = true;
  }
  const { state } = stack;
  const app = state.next.url;

  const { chromium } = require("playwright");
  const browser = await chromium.launch();
  try {
    // Warm up the dev server so the first real page does not time out while compiling.
    await waitFor(`${app}/login`);
    for (const shot of shots) {
      const email = shot.anonymous ? null : emailFor(shot.as);
      const vp = resolveViewport(shot.viewport);
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: shot.scale,
        isMobile: vp.mobile,
        hasTouch: vp.mobile,
        locale: "nb-NO",
        timezoneId: "Europe/Copenhagen",
      });
      try {
        if (email) {
          const session = mintSession({ email, sessionId: shot.sessionId ?? undefined, issuer: `${state.gateway.url}/auth/v1` });
          if (shot.screen) {
            const sid = JSON.parse(Buffer.from(session.access_token.split(".")[1], "base64url").toString()).session_id;
            const r = await runPsql(state.pg.conn, `insert into public.screen_sessions (session_id, member_id) select '${sid}', id from public.members where email = '${email.replace(/'/g, "''")}' on conflict do nothing`);
            if (r.code !== 0) console.warn(`  --screen: could not register a screen session (${r.stderr.trim().split("\n")[0]})`);
          }
          await context.addCookies(authCookies(state.gateway.url, session).map((c) => ({ ...c, url: app, httpOnly: false, sameSite: "Lax" })));
        }
        const page = await context.newPage();
        const problems = [];
        page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
        page.on("console", (m) => m.type() === "error" && problems.push(`console.error: ${m.text().slice(0, 200)}`));
        page.on("requestfailed", (r) => problems.push(`request failed: ${r.url().slice(0, 120)} ${r.failure()?.errorText ?? ""}`));
        const response = await page.goto(new URL(shot.path, app).toString(), { waitUntil: "load", timeout: 180_000 });
        await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
        await page.evaluate(() => document.fonts.ready);
        // The Next.js dev indicator (round "N" button) is not part of the page.
        await page.addStyleTag({ content: "nextjs-portal, #__next-build-watcher { display: none !important; }" }).catch(() => {});
        if (shot.waitFor) await page.waitForSelector(shot.waitFor, { timeout: 30_000 });
        await page.waitForTimeout(250);
        const finalPath = new URL(page.url()).pathname + new URL(page.url()).search;
        const file = path.resolve(shot.out ?? path.join(shot.outDir ?? path.join(MOCK_DIR, "shots"), shotFileName(shot)));
        fs.mkdirSync(path.dirname(file), { recursive: true });
        await page.screenshot({ path: file, fullPage: shot.fullPage });
        const status = response?.status() ?? 0;
        const redirected = finalPath !== shot.path ? ` (redirected to ${finalPath})` : "";
        const bad = status >= 400 ? ` STATUS ${status}` : "";
        console.log(`${path.relative(ROOT, file)}  [${shot.as ?? "anonymous"} ${shot.path} ${vp.width}x${vp.height}]${redirected}${bad}`);
        for (const p of problems.slice(0, 5)) console.log(`    ! ${p}`);
        if (status >= 400) exitCode = 1;
      } catch (error) {
        console.error(`FAILED ${shot.as ?? "anonymous"} ${shot.path}: ${error.message}`);
        exitCode = 1;
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  if (stack && started) await stack.stop();
}
process.exit(exitCode);
