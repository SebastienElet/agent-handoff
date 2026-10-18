import { afterEach, expect, test } from "bun:test";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nativeVariant } from "./platform.ts";
import manifest from "../package.json";

const roots: string[] = [];
const entry =
  process.env.HANDOFF_TEST_ENTRY ?? join(import.meta.dir, "agent-handoff.ts");

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "agent-handoff-test-"));
  roots.push(root);
  const transcript = join(root, "transcript.jsonl");
  writeFileSync(
    transcript,
    '{"type":"assistant","isSidechain":false,"message":{"usage":{"input_tokens":85000,"cache_creation_input_tokens":0,"cache_read_input_tokens":0}}}\n',
  );
  return {
    root,
    state: join(root, "state"),
    event: {
      hook_event_name: "Stop",
      session_id: "packaged",
      stop_hook_active: false,
      transcript_path: transcript,
    },
  };
}

function invoke(
  input: string,
  state: string,
  window = "100000",
  launcher = entry,
) {
  return Bun.spawnSync([process.execPath, launcher], {
    cwd: tmpdir(),
    env: {
      PATH: process.env.PATH,
      XDG_STATE_HOME: state,
      CLAUDE_CODE_AUTO_COMPACT_WINDOW: window,
    },
    stdin: Buffer.from(input),
    stdout: "pipe",
    stderr: "pipe",
    timeout: 10000,
  });
}

test("the distributed entry preserves native invalid-input status and stderr", () => {
  const { state } = fixture();
  const result = invoke("not-json", state);
  expect(result.exitCode).toBe(1);
  expect(result.stdout.toString()).toBe("");
  expect(result.stderr.toString()).toContain("agent-handoff:");
});

test("the distributed entry emits a request at the threshold and suppresses replay", () => {
  const { root, state, event } = fixture();
  const first = invoke(JSON.stringify(event), state);
  expect(first.exitCode).toBe(0);
  expect(first.stderr.toString()).toBe("");
  expect(JSON.parse(first.stdout.toString())).toEqual({
    decision: "block",
    reason:
      "Context is at 85k tokens, past the 85k handoff threshold. Start no new work. Use /handoff to emit the resume prompt for a fresh session, then stop.",
  });
  expect(
    readFileSync(join(state, "dotfiles/handoff/packaged")).byteLength,
  ).toBe(0);
  rmSync(event.transcript_path);
  const second = invoke(JSON.stringify(event), state);
  expect(second.exitCode).toBe(0);
  expect(second.stdout.toString()).toBe("");
  expect(second.stderr.toString()).toBe("");
  expect(existsSync(join(root, "home"))).toBe(false);
});

test("historical sentinels are honored before missing transcript or window access", () => {
  const { state, event } = fixture();
  mkdirSync(join(state, "dotfiles/handoff"), { recursive: true });
  writeFileSync(join(state, "dotfiles/handoff/packaged"), "historical");
  rmSync(event.transcript_path);
  const result = invoke(JSON.stringify(event), state, "invalid");
  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toBe("");
  expect(readFileSync(join(state, "dotfiles/handoff/packaged"), "utf8")).toBe(
    "historical",
  );
});

test("recursive Stop returns without reading the missing transcript", () => {
  const { state, event } = fixture();
  rmSync(event.transcript_path);
  const result = invoke(
    JSON.stringify({ ...event, stop_hook_active: true }),
    state,
    "invalid",
  );
  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toBe("");
  expect(result.stderr.toString()).toBe("");
  expect(existsSync(state)).toBe(false);
});

test("the wrapper preserves native configuration and filesystem failures", () => {
  const { state, event } = fixture();
  const invalid = invoke(JSON.stringify(event), state, "invalid");
  expect(invalid.exitCode).toBe(1);
  expect(invalid.stderr.toString()).toContain(
    "invalid CLAUDE_CODE_AUTO_COMPACT_WINDOW",
  );
  expect(existsSync(state)).toBe(false);
  mkdirSync(join(state, "dotfiles/handoff/packaged"), { recursive: true });
  const collision = invoke(JSON.stringify(event), state);
  expect(collision.exitCode).toBe(3);
  expect(collision.stderr.toString()).toContain(
    "cannot inspect handoff sentinel",
  );
});

test("the distributed entry requests the Codex skill from a Codex transcript", () => {
  const { state, event } = fixture();
  writeFileSync(
    event.transcript_path,
    JSON.stringify({
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          last_token_usage: { input_tokens: 85000 },
          model_context_window: 100000,
        },
      },
    }) + "\n",
  );
  const { hook_event_name: ignored, ...codex } = event;
  const result = invoke(JSON.stringify({ ...codex, event: "Stop" }), state);
  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout.toString()).reason).toContain("Use $handoff");
});

test("concurrent distributed entry invocations emit exactly one request", async () => {
  const { state, event } = fixture();
  const results = await Promise.all(
    Array.from({ length: 16 }, async () => {
      const child = Bun.spawn([process.execPath, entry], {
        cwd: tmpdir(),
        env: {
          XDG_STATE_HOME: state,
          CLAUDE_CODE_AUTO_COMPACT_WINDOW: "100000",
        },
        stdin: new Blob([JSON.stringify(event)]),
        stdout: "pipe",
        stderr: "pipe",
      });
      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      expect(exitCode).toBe(0);
      expect(stderr).toBe("");
      return stdout;
    }),
  );
  expect(
    results.filter((stdout) => stdout.includes('"decision": "block"')),
  ).toHaveLength(1);
});

function isolatedLauncher(version?: string, binary = false) {
  const { root, state } = fixture();
  const sourceRoot = join(import.meta.dir, "..");
  cpSync(join(sourceRoot, "bin"), join(root, "bin"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify(manifest));
  mkdirSync(join(root, "node_modules"));
  symlinkSync(
    join(sourceRoot, "node_modules/zod"),
    join(root, "node_modules/zod"),
  );
  const variant = nativeVariant(process.platform, process.arch, () =>
    process.report.getReport(),
  );
  const name = `@sebastienelet/agent-handoff-${variant}`;
  if (version !== undefined) {
    const native = join(root, "node_modules", name);
    mkdirSync(native, { recursive: true });
    writeFileSync(
      join(native, "package.json"),
      JSON.stringify({ name, version }),
    );
    if (binary) {
      mkdirSync(join(native, "bin"));
      writeFileSync(join(native, "bin/agent-handoff"), "not an executable");
    }
  }
  return { state, launcher: join(root, "bin/agent-handoff.ts") };
}

test("missing native dependency fails explicitly without invoking a build", () => {
  const { state, launcher } = isolatedLauncher();
  const result = invoke("{}", state, "100000", launcher);
  expect(result.exitCode).toBe(3);
  expect(result.stdout.toString()).toBe("");
  expect(result.stderr.toString()).toContain("optional dependencies enabled");
  expect(existsSync(state)).toBe(false);
});

test("a mismatched variant version cannot execute", () => {
  const { state, launcher } = isolatedLauncher("0.9.0");
  const result = invoke("{}", state, "100000", launcher);
  expect(result.exitCode).toBe(3);
  expect(result.stderr.toString()).toContain("1.0.0");
  expect(existsSync(state)).toBe(false);
});

test.each([false, true])(
  "a missing or nonexecutable native binary fails visibly: %s",
  (binary) => {
    const { state, launcher } = isolatedLauncher("1.0.0", binary);
    const result = invoke("{}", state, "100000", launcher);
    expect(result.exitCode).toBe(3);
    expect(result.stdout.toString()).toBe("");
    expect(result.stderr.toString()).toContain("agent-handoff:");
  },
);
