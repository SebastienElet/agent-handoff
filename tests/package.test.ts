import { expect, test } from "bun:test";
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nativeVariant } from "../bin/platform.ts";

test("local tarballs install and run outside the source checkout without workspace links", () => {
  const source = join(import.meta.dir, "..");
  const root = mkdtempSync(join(tmpdir(), "handoff-package-"));
  const variant = nativeVariant(process.platform, process.arch, () =>
    process.report.getReport(),
  );
  try {
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        private: true,
        dependencies: {
          "@sebastienelet/agent-handoff": join(source, "dist/entry.tgz"),
          [`@sebastienelet/agent-handoff-${variant}`]: join(
            source,
            "dist/native.tgz",
          ),
        },
      }),
    );
    const install = Bun.spawnSync(
      [process.execPath, "install", "--ignore-scripts"],
      {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
        timeout: 30000,
      },
    );
    expect(install.stderr.toString()).not.toContain("error:");
    expect(install.exitCode).toBe(0);
    const entry = join(root, "node_modules/.bin/agent-handoff");
    expect(realpathSync(entry).startsWith(realpathSync(root) + "/")).toBe(true);
    const native = join(
      root,
      "node_modules/@sebastienelet",
      `agent-handoff-${variant}`,
    );
    expect(realpathSync(native).startsWith(realpathSync(root) + "/")).toBe(
      true,
    );
    expect(readFileSync(join(native, "BUILD.json"), "utf8")).toContain(
      '"revision"',
    );
    const skill = join(
      root,
      "node_modules/@sebastienelet/agent-handoff/skills/handoff/SKILL.md",
    );
    expect(readFileSync(skill, "utf8").length).toBeGreaterThan(0);
    const contract = Bun.spawnSync(
      [process.execPath, "test", "bin/agent-handoff.test.ts"],
      {
        cwd: source,
        env: { ...process.env, HANDOFF_TEST_ENTRY: entry },
        stdout: "pipe",
        stderr: "pipe",
        timeout: 30000,
      },
    );
    expect(contract.stderr.toString()).toContain("0 fail");
    expect(contract.exitCode).toBe(0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 60000);
