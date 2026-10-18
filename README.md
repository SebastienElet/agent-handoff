# Agent Handoff

`agent-handoff` reads a Stop event and its transcript, then requests the companion `handoff`
skill when the configured context threshold is reached. The hook emits a request; the agent
executes the skill and writes a resume prompt. The user or enclosing workflow creates the next
session. No session is created by this package.

The first autonomous release is prepared as `1.0.0`; it has not been published or qualified from
the registry. Supported release targets are macOS ARM64 and Linux x64 glibc, with native builds
and consumption checks on macOS 26 and Ubuntu 24.04 runners. Other architectures, musl and Windows
are unsupported. A local build does not establish compatibility with every OS or glibc version.

## Install and activate

After publication, use Bun 1.4.3 in a durable, dedicated directory:

```sh
bun init -y
bun add --exact @sebastienelet/agent-handoff@1.0.0
```

Commit that installation's manifest and `bun.lock`; subsequent installations use
`bun install --frozen-lockfile`. Native variants are exact optional dependencies. Missing,
mismatched or unsupported variants fail explicitly; no compilation or platform fallback occurs.
Bun is required at runtime; Cargo, Moon, Arnes and dotfiles are not.

Register the absolute path to `node_modules/.bin/agent-handoff` as a Stop command in the host's
configuration, preserving other handlers. Expose `node_modules/@sebastienelet/agent-handoff/skills/handoff`
in the host's user skill directory. Use native host configuration or an explicit configuration
manager; installation does not activate hooks or skills and never edits agent configuration.
Refuse an occupied or divergent skill destination before creating a link. Claude Code and Codex
are the intended integrations; live discovery and activation have not been exercised for this
extraction. Cursor has no declared Stop integration here.

## Hook contract

There are no CLI options. Read one JSON object from stdin with `hook_event_name: "Stop"`
(Claude Code) or `event: "Stop"` (Codex), a nonempty `session_id`, `transcript_path`, and optional
boolean `stop_hook_active`. Session IDs use ASCII letters, digits, `.`, `_` and `-`, excluding
`.` and `..`. Both event names, when present, must be `Stop`. Extra arguments are ignored.

Claude transcripts use non-sidechain assistant usage records; Codex transcripts use the latest
retained `token_count` usage and context window. The existing parser and numeric contract are
covered by `tests/transcript.rs` and `tests/transcript/numeric.rs`. Invalid retained JSON is an
error; absent usable usage is a silent success.

`HANDOFF_TOKEN_THRESHOLD`, when nonempty, sets an absolute token threshold. Otherwise the threshold
is floor(85% of the context window): Codex's transcript window, or
`CLAUDE_CODE_AUTO_COMPACT_WINDOW`. Explicit values must be positive decimal safe integers.
Usage equal to the threshold triggers the request. No threshold policy changed in this extraction.

Success exits 0, either silently or with a JSON `decision: "block"` and a `reason` asking the
agent to use `/handoff` (Claude Code) or `$handoff` (Codex). Input, transcript and configuration
errors exit 1; filesystem, output and launcher failures exit 3, with diagnostics on stderr.
Host interpretation of the block request is distinct from the hook's exit code.

## State and rollback

State stays at `$XDG_STATE_HOME/dotfiles/handoff/<session_id>`, falling back to
`$HOME/.local/state/dotfiles/handoff/<session_id>` when XDG state is absent or empty. The historical
namespace is intentional: existing regular-file sentinels suppress replay before transcript
access. Recursive Stop events return silently. Exclusive sentinel creation chooses one concurrent
writer. A sentinel is created before stdout is written; output failure leaves it present, as in
the original contract. Sentinels and transcripts are never purged by installation or rollback.

Before switching a consumer, record the old executable, skill destination, hook entries and
version. Keep them until the registry artifact, hook/skill activation and rollback have been
exercised. Restore those entries and the old executable/skill on failure, preserving foreign
configuration and all state. For later releases, reinstall the previous exact qualified package.
The first extraction can return to dotfiles revision
`89307efadc512f6021696bdf7ebb8249c820a2ff`. This preparation has not switched consumers or rehearsed
their live rollback.

## Develop and release

Sources and tests were transferred from `tooling/agent-handoff` at the revision above. The skill
ships in `skills/handoff`; personal preferences and product-specific session obligations remain
with the consuming workflow. Edit this repository alone for this capability.

```sh
bun install --frozen-lockfile
cargo fmt --all --check
cargo check --workspace --all-targets --all-features --locked
cargo clippy --workspace --all-targets --all-features --locked -- -D warnings
cargo test --workspace --all-features --locked
RUSTDOCFLAGS=-Dwarnings cargo doc --workspace --all-features --no-deps --locked
cargo build --release --locked
bun run package:native
bun test
bun run typecheck
bun pm pack --dry-run
```

Use the pinned Rust toolchain with rustup proxies on PATH. The original native lint policy is
retained. Wrapper tests exercise the real binary and historical sentinels; pure platform tests
cover unsupported OS/architecture and unavailable libc identification. A local tarball smoke is
not registry qualification. The package includes sources, tests, skill, license and dependency
notices; native variants include their binary and build identity.

The CI workflow transfers the existing Rust checks to both native targets. The manually invoked
release workflow builds each variant on its target, packs with Bun, and publishes native variants
before the entry package using only `npm publish --provenance` with OIDC. Configure trusted
publishing for all three packages against `publish.yml` in the public source repository, with
the `npm` environment. npm requires a preconfigured trusted publisher and a supported Node/npm
version ([official setup](https://docs.npmjs.com/trusted-publishers/)). The repository and publisher
configuration do not exist yet. After a partial/uncertain publish, inspect the exact versions,
integrities and provenance in the registry before any retry; publication is not atomic.

Before recommending a release, install it from the registry with Bun on both targets without
dotfiles or a neighboring checkout; record artifact integrity, provenance, source revision,
OS/architecture and host versions, and exercise input failures, threshold, replay, concurrency,
live hook/skill activation and rollback. No such registry or live-host evidence is claimed here.
