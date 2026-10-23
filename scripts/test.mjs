import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

// Use the same Node executable for both packages. No build or nested package
// manager is needed to run unit tests.
for (const app of ["backend", "frontend"]) {
  const result = spawnSync(
    process.execPath,
    [
      resolve(app, "node_modules/vitest/vitest.mjs"),
      "run",
      "--passWithNoTests",
    ],
    {
      cwd: resolve(app),
      stdio: "inherit",
      windowsHide: true,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
