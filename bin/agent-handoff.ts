#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import manifest from "../package.json";
import { nativeVariant } from "./platform.ts";

try {
  const variant = nativeVariant(process.platform, process.arch, () =>
    process.report.getReport(),
  );
  const name = `@sebastienelet/agent-handoff-${variant}`;
  let metadataPath: string;
  try {
    metadataPath = fileURLToPath(import.meta.resolve(`${name}/package.json`));
  } catch {
    throw new Error(
      `Missing ${name}@${manifest.version}. Reinstall with Bun and optional dependencies enabled.`,
    );
  }
  z.object({
    name: z.literal(name),
    version: z.literal(manifest.version),
  }).parse(JSON.parse(readFileSync(metadataPath, "utf8")));
  const child = Bun.spawn(
    [
      join(dirname(metadataPath), "bin/agent-handoff"),
      ...process.argv.slice(2),
    ],
    {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));
  process.exitCode = await child.exited;
} catch (error) {
  console.error(
    `agent-handoff: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 3;
}
