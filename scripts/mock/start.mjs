// `npm run mock` - starts Postgres + mock Supabase gateway + the app and keeps running until Ctrl+C.
//   npm run mock                 next dev
//   npm run mock -- --prod       next build && next start
//   npm run mock -- --port 3100  fixed app port
import { parseArgs } from "./session.mjs";
import { readRunningStack, startStack } from "./stack.mjs";

const args = parseArgs(process.argv.slice(2), ["prod", "noNext"]);
const running = await readRunningStack();
if (running) {
  console.log(`A mock stack is already running (pid ${running.pid}): app ${running.next?.url ?? "(none)"}, gateway ${running.gateway.url}`);
  process.exit(0);
}

const { state, stop } = await startStack({ prod: !!args.prod, nextPort: args.port ? Number(args.port) : undefined, noNext: !!args.noNext, echo: true });
console.log(`\nMock stack ready.\n  app      ${state.next?.url ?? "(not started)"}\n  gateway  ${state.gateway.url}\n  logs     .mock/gateway.log, .mock/next.log\n  state    .mock/state.json\nSign in with a cookie: npm run shot -- --as Emma --path /   (or node scripts/mock/session.mjs --as Emma)\nCtrl+C to stop.`);

let stopping = false;
const shutdown = async (signal) => {
  if (stopping) return;
  stopping = true;
  console.log(`\n${signal}: stopping the mock stack ...`);
  await stop();
  process.exit(0);
};
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => void shutdown(sig));
process.on("uncaughtException", async (error) => {
  console.error(error);
  await shutdown("uncaughtException");
});
setInterval(() => {}, 1 << 30);
