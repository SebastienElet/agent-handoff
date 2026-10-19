---
name: handoff
description: >
  Hand the current work to a fresh session instead of letting the context compact. Use when the
  window is nearly full, a Stop hook reports the handoff threshold, or a resume prompt is asked
  for. Make sure to use it whenever a session must continue elsewhere, even if the context limit
  is never named.
compatibility: Claude Code or Codex; optional agent-handoff Stop hook installed with Bun
metadata:
  category: ops
---

# Handoff

## Overview

Produce a short, copy-pasteable prompt that lets a fresh session resume the current work, and then
stop. Compaction summarises a transcript and keeps its noise; a handoff restates only the live
state, so the next session starts small and accurate. The optional `agent-handoff` Stop hook
requests this skill when context usage reaches its threshold. The agent still needs to invoke
the skill; the hook does not execute it or create a new session. It is also useful on demand.

## Usage

```text
/handoff
$handoff
```

Use `/handoff` in Claude Code and `$handoff` in Codex. There are no options. The output is a single
fenced block for the user to paste into a new session.

## Steps

1. Stop the current work — do not start a new edit, search, or tool loop.
2. Finish making the work durable: save unsaved files and, if a change is complete and the user
   asked for it, commit it. A resume prompt pointing at lost edits is worthless.
   If the enclosing workflow requires a durable report, update that existing report and reference
   it in the prompt; do not create a competing report. Follow that workflow's session and checkout
   ownership rules.
3. Write the resume prompt as one fenced block, addressed to the next agent, in the language of the
   conversation, covering:
   - **Goal** — the task in one or two sentences, including constraints and acquired permissions.
   - **Done** — what is already done and verified, with file paths.
   - **Next step** — the single next concrete action, identifying any half-done step.
   - **Files** — the paths the next session needs to read first.
   - **Carry forward**, when needed — useful rejected attempts and their evidence, open decisions
     and verification limits, including tests not run and platforms not exercised. State what was
     ruled out and why; tell the next agent not to retry it without new facts. Keep unresolved
     decisions separate from acquired permissions. Leave implementation discovery to the next agent
     rather than prescribing a solution.
4. Aim for ~200 words for a simple case; this is not a length cap. Preserve all information that
   conditions the next action. Replace detail with a durable reference only when the next agent can
   actually access it and it contains that information. Otherwise include the necessary evidence
   in the prompt, especially when it exists only in this conversation.
5. End your turn immediately after the block. Do not add follow-up work or offer to continue.

## Gotchas

- **Summarising the conversation instead of the state** — a handoff is not a transcript summary.
  Drop inconsequential abandoned ideas and tool noise, but retain rejected attempts whose evidence
  prevents repetition. A file path cannot replace evidence that was never saved there.
- **Emitting the prompt and then continuing to work** — the point is to end the session before
  compaction. Any further tool call adds context and defeats it, so stop after the block.
- **Leaving work uncommitted** — the next session inherits the working tree, not the reasoning. State
  explicitly under **Done** whether changes are committed, staged, or only on disk.
- **Writing the block in English out of habit** — the section labels above are English because this
  file must be, for multi-agent portability; the block itself follows the conversation's language.
- **Being triggered mid-task by the hook** — the threshold fires at the end of a turn regardless of
  where the work stands. Say plainly under **Next step** that a step is half-done, rather than
  implying it is complete.
- **Expecting the hook to fire with no known window** — Claude Code needs
  `CLAUDE_CODE_AUTO_COMPACT_WINDOW` or `HANDOFF_TOKEN_THRESHOLD`; Codex supplies its window in the
  transcript. Invoke the skill manually when the hook cannot determine a limit.

## Constraints

- Never keep working after emitting the handoff block — end the turn there.
- Never invent progress: only claim what was actually run and verified in this session.
- Keep the block self-contained — the next session sees no part of this conversation.
- Outside a workflow that requires a report, do not write the handoff to a file unless the user
  asks; the deliverable is text to paste. An enclosing workflow's report obligation still applies.
- Do not attempt to disable or block compaction from the skill — that is the hook's job, via the
  threshold in `agent-handoff`.
