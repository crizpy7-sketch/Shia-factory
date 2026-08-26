# Claude Code — Repository Working Agreement

This repository follows the **Shia App Factory Canonical App Build & Delivery Standard** maintained in `Shia-factory/APP_BUILD_STANDARD.md`.

## Claude's default role

Claude may edit this repository when authorized through the Git/GitHub credentials available in its environment.

Claude does **not** need direct production SSH credentials for ordinary application changes.

Normal path:

```text
REQUEST
→ inspect current repository truth
→ make scoped change
→ run required checks
→ commit / open PR
→ approved change reaches main
→ GitHub Actions deploys to VPS
→ health gates prove production state
```

## Mandatory rules

1. Treat current repository source as implementation truth. Do not reconstruct current state from chat history.
2. Read `AGENTS.md`, README/specs, and local architecture/decision records before non-trivial mutation.
3. Edit Git-tracked source. Do not manually patch production files over SSH for routine app work.
4. Never ask the user to paste a private SSH key, API key, password, webhook, or production `.env` into chat.
5. Never commit secrets or echo them into logs.
6. Use branches/worktrees for medium/high-risk or concurrent work. Avoid conflicting writes with another coding agent.
7. Do not redefine DONE around what was built. Satisfy the requested acceptance criteria.
8. Do not weaken tests, migrations, or health gates merely to make CI green.
9. Deployment success requires runtime evidence, not just a successful commit or Docker build.
10. If repeatable manual VPS repair was necessary, encode the repeatable fix into the repository/deployment harness afterward when practical.

## Production model

GitHub is the collaboration boundary between Claude, ChatGPT/OpenAI agents, Codex, and other authorized coding agents.

Production credentials remain in GitHub Actions secrets, an approved secret manager, or the VPS production environment. Claude should normally trigger deployment indirectly by producing an approved Git commit rather than by possessing raw VPS secrets.

## Completion report

When finished, report:

- files changed;
- tests/checks executed and their actual results;
- commit/PR identifier;
- deployment status if deployment was expected;
- health-gate results;
- any remaining unverified condition.

Never fabricate runtime state.