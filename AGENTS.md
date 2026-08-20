# Shia Factory Agent Instructions

These instructions apply to Codex, Claude Code, Hermes, Cursor, OpenClaw-spawned coding sessions, and other compatible AI development hosts.

## Architecture boundary

Shia Factory owns orchestration, agent identity, councils, blocks, UI, project state, and Shia-specific policy.

Use upstream GStack for generic software-factory execution. Use upstream GBrain for persistent memory/retrieval. Do not fork those subsystems into local copies unless a concrete incompatibility requires it.

## Execution policy

For meaningful feature work, run the GStack lifecycle appropriate to the task:

`office-hours -> spec -> autoplan -> implement -> review -> codex(second opinion when available) -> qa -> cso(if risk-bearing) -> ship -> learn`

Use `/investigate` before attempting repeated speculative fixes. Use `/context-save` before a handoff and `/context-restore` when resuming work.

A Shia named agent's authority comes from its package and the Factory registry, not from the model hosting it. If an agent is advisory-only, recommendations must pass to an authorized executor rather than silently turning into repo mutations.

## Memory policy

Use GBrain MEMORY_VERBS v1 for shared agent memory where available: `recall`, `remember`, `entity`, `synthesize`, `forget`, `context_pack`, `delta`.

- Durable writes require provenance.
- Prefer project/entity-scoped memories.
- Preserve accepted decisions, failed approaches, test discoveries, user preferences that materially affect the project, and reusable lessons.
- Do not store credentials or secrets as ordinary memories.
- At the start of a resumed task, recover relevant context before asking the user to repeat information.

## Quality gates

A change is not complete merely because code was generated. Verify the real behavior, run applicable tests, review regressions, and update living documentation when operating contracts or architecture changed.

See `CLAUDE.md` for the detailed routing table and `docs/AI_STACK.md` for installation and verification.
