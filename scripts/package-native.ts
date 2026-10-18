import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { nativeVariant } from "../bin/platform.ts";

const root = join(import.meta.dir, "..");
const variant = nativeVariant(process.platform, process.arch, () =>
  process.report.getReport(),
);
const destination = join(root, "packages", `agent-handoff-${variant}`);
const revisionResult = Bun.spawnSync(["git", "rev-parse", "HEAD"], {
  cwd: root,
});
if (revisionResult.exitCode !== 0)
  throw new Error(revisionResult.stderr.toString());
const revision = z
  .string()
  .regex(/^[a-f0-9]{40}$/)
  .parse(revisionResult.stdout.toString().trim());
const compiler = Bun.spawnSync(["rustc", "--version"], { cwd: root });
if (compiler.exitCode !== 0) throw new Error(compiler.stderr.toString());
mkdirSync(join(destination, "bin"), { recursive: true });
copyFileSync(
  join(root, "target/release/agent-handoff"),
  join(destination, "bin/agent-handoff"),
);
copyFileSync(join(root, "LICENSE"), join(destination, "LICENSE"));
copyFileSync(
  join(root, "THIRD_PARTY_LICENSES"),
  join(destination, "THIRD_PARTY_LICENSES"),
);
writeFileSync(
  join(destination, "BUILD.json"),
  JSON.stringify(
    {
      revision,
      variant,
      rustc: compiler.stdout.toString().trim(),
      bun: Bun.version,
      os: process.platform,
      architecture: process.arch,
    },
    null,
    2,
  ) + "\n",
);
