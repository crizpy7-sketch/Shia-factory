# App Repository — Agent Instructions

This repository follows the **Shia App Factory Canonical App Build & Delivery Standard**.

Canonical factory standard:
`Shia-factory/APP_BUILD_STANDARD.md`

## Default workflow

```text
READ CURRENT REPO
→ DEFINE ACCEPTANCE CRITERIA
→ EDIT IN GIT
→ TEST
→ REVIEW
→ COMMIT / PR
→ MAIN
→ GITHUB ACTIONS
→ VPS
→ HEALTH GATES
```

## Rules

- GitHub is the source of truth for application code.
- Edit the repository, not production files on the VPS.
- Do not rely on old chat messages for current implementation truth.
- Keep secrets out of source, chat, screenshots, commits, and logs.
- Never request raw VPS credentials when the repository deployment workflow can perform deployment.
- Coordinate concurrent agents through branches/worktrees; do not give two agents conflicting write authority over the same mutable files.
- A commit is not proof that production is healthy. Verify CI and runtime health evidence.
- Do not weaken tests or health gates to make a deployment appear successful.
- Terminal/SSH is for bootstrap, infrastructure work, secret rotation, or recovery—not routine product edits.

## Before declaring DONE

Verify all applicable checks:

- build/typecheck/lint;
- relevant tests;
- migration success;
- web health;
- API/application-data health;
- worker/daemon health;
- deployment tied to the intended commit.

Anything not verified must be labelled unverified.