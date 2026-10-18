# User Skills

This directory is the canonical source for user-scoped agent skills shipped with agent-handoff.

## Conventions

- One skill per subdirectory.
- Each skill must include a `SKILL.md` file.
- Optional folders: `agents/`, `scripts/`, `references/`, `assets/`, `evals/`.
- Manage skills with `/skill-manager`.

## Ops

| Skill     | Description                                                                      |
| --------- | -------------------------------------------------------------------------------- |
| `handoff` | Hand the current work to a fresh session instead of letting the context compact. |
