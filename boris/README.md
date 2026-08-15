# BORIS-001 runtime

A persistent, tool-using software-engineering agent. BORIS receives an objective, inspects the
workspace, plans, edits real files, runs real commands, observes what actually happened, verifies
his own claims, repairs what failed, remembers what mattered, and reports evidence.

He is the same BORIS-001 defined in [`agents/BORIS-001`](../agents/BORIS-001) — this runtime reads
that package as the source of truth for identity, cognitive model, authority and certification
status. It never rewrites it.

```
objective ─► load identity + relevant memory ─► plan ─► act (tools) ─► observe
   ▲                                                                      │
   └──── report evidence ◄── store experience ◄── repair ◄── verify ◄──────┘
```

## Quick start (local)

```sh
cd boris
npm install
cp .env.example .env          # set ANTHROPIC_API_KEY to run against a real model
npm run build
node dist/src/cli.js migrate      # create the database
node dist/src/cli.js bootstrap    # seed skills, import BORIS's portable state into memory
node dist/src/cli.js run          # API + dashboard + worker + scheduler in one process
```

Then open the building:

| Address | What it is |
| --- | --- |
| <http://127.0.0.1:8787/hq> | **Headquarters** — Office, Workshop, Lab, Records |
| <http://127.0.0.1:8787/factory> | The block workbench |
| <http://127.0.0.1:8787/> | The BORIS Control Center |

Everything is served from one origin, so no cross-origin permission is involved. To host HQ
elsewhere, set `BORIS_ALLOWED_ORIGINS` to that origin — there is no wildcard.

Submit an objective from the dashboard or the CLI:

```sh
node dist/src/cli.js submit "Inspect this codebase, find the failing test, repair it and verify." \
  --workspace ./workspaces/my-project
node dist/src/cli.js tasks
node dist/src/cli.js task task_xxx
```

Run the services separately (as production does):

```sh
node dist/src/cli.js serve      # API + dashboard
node dist/src/cli.js worker     # claims and executes queued tasks
node dist/src/cli.js scheduler  # fires durable schedules
```

## Before going live

```sh
node dist/src/cli.js preflight    # identity, storage, workspaces, tooling, credentials, one live call
node dist/src/cli.js acceptance   # the full acceptance objective against the configured provider
```

`preflight` is the only command that spends money, and only one minimal completion. `acceptance`
copies the fixture project into a fresh workspace, gives BORIS the real objective, and then
independently re-runs the test suite itself — it exits non-zero unless the repair is genuinely
verified.

## How he works

1. **Inspect.** Read-only tools are open from the start.
2. **Plan.** `plan` records steps, reasons, verification and risks. **Nothing that changes the
   workspace runs until a plan exists** — the gate is in code, not in the prompt.
3. **Act.** File, shell, git and dev tools, each permission-checked.
4. **Verify.** A success claim with a verification command is re-run by the runtime itself.
5. **Repair.** A failed verification returns as a repair cycle, and the failure is captured in
   memory with a signature. When the same signature recurs, BORIS is told to leave behind a
   permanent safeguard instead of another one-off fix.
6. **Deliver.** `git_commit` is available behind human approval. Pushing is not available at all.

## Verification

```sh
npm run typecheck     # strict TypeScript, no errors
npm run lint          # eslint, no errors
npm test              # unit + integration
npm run test:security # adversarial suite
npm run test:e2e      # end-to-end: real repair, real process kill, real recovery
npm run gauntlet      # all of the above in order
```

## What is real, and what is not

| Capability | State |
| --- | --- |
| Agent loop, tools, permissions, tasks, memory, skills, workers, scheduler, events, API, dashboard | Implemented and tested |
| Anthropic provider | Implemented; **untested against a live model in this environment** (no API key available here) |
| OpenAI provider | Implemented (chat completions + function calling); request/response mapping unit-tested with a stubbed fetch, **not yet exercised against the live API** |
| Scripted provider | Deterministic test double. Gated behind `BORIS_ALLOW_TEST_PROVIDER=true`, always reported as a test double by the API |
| Moonshot / xAI / local providers | Not implemented. The abstraction has a place for them; the adapters do not exist |
| Postgres storage | Not implemented. `src/storage/types.ts` is the port; SQLite is the only adapter shipped |
| MCP tool servers | Not implemented. The tool registry is the extension point |

Nothing in the dashboard is simulated. Where a value is unknown the UI says `unknown`; where a
provider reports no pricing it says so rather than showing a fabricated cost.

## Documentation

- [Architecture](docs/architecture.md) — components, data flow, storage schema, extension points
- [Operations](docs/operations.md) — configuration, troubleshooting, backup and recovery
- [Deployment](docs/deployment.md) — Docker, VPS, health checks, upgrades

## Authority

BORIS is advisory in the Shia App Factory sense: he may challenge, investigate and request rework.
He may not merge, deploy, access secrets, or act outside his workspace. Those boundaries are
enforced by `src/policy/permissions.ts` before a tool runs — not by asking the model nicely. Final
authority is Cristian's.

Runtime recertification is **PENDING**. This runtime hosting BORIS is not the same thing as this
runtime being certified as BORIS; see `agents/BORIS-001/evals/RECERTIFICATION.md`.
