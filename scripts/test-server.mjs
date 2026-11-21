import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const state = mkdtempSync(join(tmpdir(), "evermore-"));
const cleanup = () => rmSync(state, { recursive: true, force: true });
function launch(command, args, env = process.env) {
  const r = spawnSync(command, args, { stdio: "inherit", env });
  if (r.status !== 0) {
    cleanup();
    process.exit(r.status ?? 1);
  }
}
launch("node", [
  "node_modules/wrangler/bin/wrangler.js",
  "d1",
  "execute",
  "DB",
  "--local",
  "--file",
  "database/schema.sql",
  "--persist-to",
  state,
]);
const child = spawn(
  "node",
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    "8794",
    "--strictPort",
  ],
  { stdio: "inherit", env: { ...process.env, EVERMORE_TEST_STATE: state } },
);
child.on("close", (code) => {
  cleanup();
  process.exit(code ?? 0);
});
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
