# Shia App Factory — Canonical App Build & Delivery Standard

**Status:** ACTIVE / DEFAULT

This document is the persistent, model-neutral standard for building, editing, reviewing, deploying, and maintaining apps produced through the Shia App Factory.

It exists so ChatGPT/OpenAI coding agents, Claude Code, Codex, and other authorized coding agents can work on the same products without depending on chat history or requiring the owner to repeat terminal commands for normal application changes.

If a project has a stricter local rule, the stricter project rule wins. Otherwise, use this standard.

---

## 1. Core rule

```text
USER INTENT
→ REPOSITORY SPEC / TASK
→ AGENT EDITS REPOSITORY
→ TESTS / REVIEW
→ COMMIT OR PR
→ MAIN
→ GITHUB ACTIONS
→ VPS DEPLOY
→ DATABASE MIGRATION IF NEEDED
→ START / RESTART SERVICES
→ HEALTH GATES
→ LIVE APP
```

**GitHub is the source of truth for application code.**

Normal product work must not depend on manually editing files on the VPS. The VPS is a runtime target, not the canonical development workspace.

---

## 2. Default developer experience

For an app that has completed the one-time production bootstrap:

1. An authorized coding agent reads the repository instructions and current source.
2. The agent makes the requested change in GitHub or in a Git worktree that will be pushed to GitHub.
3. Relevant tests, type checks, lint, build checks, migrations, and acceptance criteria are executed.
4. The exact candidate is committed.
5. Production deployment is triggered from GitHub Actions when `main` changes, or by an explicit workflow dispatch.
6. GitHub Actions connects to the VPS using repository/organization secrets.
7. The workflow copies or pulls the release, builds containers, runs additive/idempotent migrations, starts the services, and performs health checks.
8. The deployment is considered successful only when the required health gates pass.

**Routine UI changes, API changes, agent logic, bug fixes, scanner/business rules, tests, and normal application updates should not require the owner to type SSH or terminal commands.**

---

## 3. Multi-agent rule: ChatGPT, Claude, Codex, and others

All authorized coding agents work against the same repository truth.

### Required behavior

- Read `AGENTS.md`, project-specific `CLAUDE.md` when relevant, this standard, and the project README/spec before non-trivial work.
- Pull/fetch the latest repository state before editing.
- Do not infer current code from old chat messages.
- Preserve existing architecture unless the task explicitly requires changing it.
- Do not silently replace a canonical repository with a new repository.
- Do not create parallel competing implementations when the canonical implementation can be evolved safely.
- Never claim deployment success from a code commit alone. Verify CI/deployment evidence.
- Never expose private keys, API keys, passwords, webhooks, or production environment values in chat, logs, source, screenshots, commits, or PR text.

### Write coordination

Two agents must not have conflicting write authority over the same mutable branch or file set at the same time.

Default collaboration pattern:

```text
Agent A branch/worktree ─┐
                         ├─> review / tests ─> main ─> deploy
Agent B branch/worktree ─┘
```

For a small, owner-approved, low-risk fix, an authorized agent may use the repository's existing direct-to-main fast path if that repo is intentionally configured that way. For medium/high-risk work, use an isolated branch/PR and review before `main`.

### Claude rule

Claude Code does **not** need its own VPS password or production SSH private key for ordinary app edits.

Claude edits the Git repository using the GitHub credentials/authorization available in its environment. Once an approved change reaches `main`, the repository's deployment workflow performs the VPS deployment using GitHub-held deployment secrets.

The same principle applies to Codex and other authorized coding agents.

---

## 4. Source-of-truth hierarchy

| Question | Authority |
| --- | --- |
| What code exists? | Current Git repository source |
| What should the app do? | Versioned spec / acceptance criteria |
| What is live? | Deployment + runtime health evidence |
| Why was a design chosen? | ADR / decision record |
| What work is active? | Current task/project state |
| What did another agent change? | Git commit / PR / diff |
| What secrets exist? | Secret manager / VPS env only; never documentation |
| What proves success? | Tests, CI logs, health checks, runtime evidence |

Chat history may provide intent and context, but it does not override the current repository.

---

## 5. Standard repository shape for deployable apps

New serious applications should converge toward this shape where applicable:

```text
/
├── AGENTS.md
├── CLAUDE.md                 # when Claude-specific guidance is useful
├── README.md
├── .env.example              # names only; never real secrets
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── deploy-vps.yml
├── deploy/
│   ├── docker-compose.yml
│   ├── Dockerfile            # or app-specific Dockerfiles
│   └── bootstrap-vps.sh      # optional one-time bootstrap
├── docs/
│   ├── architecture/
│   └── decisions/
├── src/ or app-specific source
└── tests/
```

A project may use a different language/framework structure, but it should retain the same operational concepts: repository truth, repeatable build, controlled secrets, automated deployment, and observable health.

---

## 6. Production deployment standard

### Production trigger

Deployment should normally occur from:

- a successful merge/push to `main`; or
- an explicit GitHub Actions `workflow_dispatch`.

Production should not depend on a developer manually copying source files in an SSH session.

### Deployment transport

Default VPS transport is authenticated SSH/SCP or a repository pull executed by GitHub Actions.

Use a **dedicated deploy key**, not a personal SSH key.

Deployment secrets belong in GitHub Actions repository/environment secrets (or another approved secret manager), for example:

```text
VPS_HOST
VPS_USER
VPS_PORT
VPS_SSH_KEY_B64
```

Never commit those values.

### Runtime

Docker + Docker Compose is the default VPS runtime when practical because it gives every agent and environment the same build/run contract.

Each app should have an explicit production environment file stored on the VPS with restricted permissions, for example:

```text
/opt/<app>/deploy/.env.production
```

Use mode `600` or an equivalent restricted permission model.

### Ports

Do not assume a common port such as `3000` is free on a shared VPS.

Each application must:

- use an explicit configurable host port;
- detect/report port conflicts during deployment;
- avoid killing an unrelated process merely to claim the preferred port;
- persist the selected production port if an automatic safe fallback is used.

---

## 7. Health-gated deployment

A deployment is **not successful** merely because Docker built an image or a process started.

A serious app must define health gates appropriate to its architecture.

Typical three-layer gate:

```text
1. WEB / UI
2. API / BACKEND
3. WORKER / SCHEDULER / DAEMON
```

Examples:

- web route returns a successful response;
- API `/health` returns healthy;
- a real application data/dashboard route succeeds, not only a shallow liveness endpoint;
- worker/daemon remains running across a stability interval;
- required database schema exists and is readable;
- critical dependencies are either healthy or explicitly reported degraded.

If a required gate fails, GitHub Actions must report the deployment as failed.

Do not make CI green by weakening the gate. Fix the system or explicitly redefine the requirement with evidence.

---

## 8. Database changes

Production database changes must be versioned and repeatable.

Preferred rules:

- additive when possible;
- idempotent where practical;
- run before services that require the new schema;
- preserve existing data;
- no destructive migration without explicit review/approval and a recovery plan;
- migration failure blocks deployment.

One-off migration commands inside non-interactive CI must not consume the parent SSH/script stdin.

---

## 9. Secrets and credentials

### Never do this

- paste a private SSH key into chat;
- screenshot a private key;
- commit `.env.production`;
- put API keys in `README.md` or `CLAUDE.md`;
- echo secrets in CI logs;
- give every coding agent raw production credentials when GitHub deployment can mediate the action.

### If a secret is exposed

Treat it as compromised:

```text
REVOKE / REMOVE
→ GENERATE REPLACEMENT
→ UPDATE SECRET STORE
→ VERIFY ACCESS
→ CONTINUE
```

Do not keep using an exposed secret because the repository is private or the screenshot was deleted.

---

## 10. When terminal access is still allowed/required

The no-terminal workflow is the **normal application-development path**, not a promise that SSH will never be needed.

Direct VPS/terminal access is appropriate for:

- first-time VPS/bootstrap setup;
- creating/rotating deployment credentials;
- Docker/OS/package-manager failure;
- firewall, DNS, TLS, reverse-proxy, disk, kernel, or network infrastructure work;
- production disaster recovery;
- recovering when GitHub Actions cannot reach the server;
- inspecting a failure that cannot be diagnosed from CI/runtime observability;
- changing a secret that is intentionally stored only on the VPS.

After recovery, encode the repeatable fix into the repository/deployment harness whenever practical so the same manual step is not required again.

---

## 11. Human approval and risk tiers

Automation does not eliminate review.

Use stronger controls for higher-consequence changes.

| Risk | Examples | Default path |
| --- | --- | --- |
| Low | copy, styling, isolated UI bug | tests + fast path allowed |
| Medium | API behavior, data model, workflow logic | branch/PR + review + CI |
| High | auth, payments, production data, destructive migrations, permissions, deployment infrastructure | isolated change + independent review + explicit human approval + recovery plan |

A reviewer approves an exact candidate. A material change after approval invalidates that approval.

---

## 12. Deployment receipts

Every production deployment should leave enough evidence for another agent to answer:

- what commit is live;
- when it deployed;
- whether CI passed;
- which services are running;
- which public/local port or domain serves the app;
- whether migrations ran;
- whether health gates passed;
- what failed if the deployment did not pass.

The Git commit SHA + GitHub Actions run + runtime health output form the minimum deployment receipt.

---

## 13. New app bootstrap checklist

Before calling a new serious app production-ready, establish:

- canonical GitHub repository;
- `AGENTS.md` / coding-agent instructions;
- tests and build command;
- Docker/runtime definition when appropriate;
- `.env.example` with secret names only;
- VPS app directory;
- dedicated deploy key;
- GitHub deployment secrets;
- production env file on server;
- CI workflow;
- deploy workflow;
- migration step if the app persists data;
- web/API/worker health gates as applicable;
- rollback/recovery path;
- deployment receipt.

Once these are established, normal edits should flow **repository → CI → VPS**, not **chat → manual terminal**.

---

## 14. Existing applications

Existing repositories are grandfathered until they are touched for meaningful work.

When an existing app receives a significant update, prefer migrating it toward this standard rather than creating another bespoke deployment process.

Do not break a working production app merely to achieve structural uniformity. Migrate incrementally and verify after every step.

---

## 15. Default acceptance criteria for this standard

A project conforms when all applicable statements are true:

- [ ] Current source is recoverable from GitHub.
- [ ] Another authorized coding agent can understand how to edit/test the repo without old chat history.
- [ ] Production secrets are absent from source and logs.
- [ ] Normal code changes can deploy without owner-entered SSH commands.
- [ ] Deployment is reproducible from GitHub Actions.
- [ ] Production migration is repeatable and gated.
- [ ] Health checks test the actual app path, not only process existence.
- [ ] Worker/daemon health is checked when the app has background execution.
- [ ] Port conflicts cannot silently kill unrelated apps.
- [ ] Failed deployments stay visibly failed.
- [ ] Successful deployments leave a receipt tied to a commit.
- [ ] Claude/Codex/ChatGPT can collaborate through Git rather than sharing raw VPS credentials.

---

## 16. Short version for agents

```text
READ REPO TRUTH.
EDIT THE REPO, NOT THE VPS.
TEST THE EXACT CANDIDATE.
KEEP SECRETS OUT OF SOURCE/CHAT.
COORDINATE WRITES THROUGH GIT.
DEPLOY MAIN THROUGH GITHUB ACTIONS.
MIGRATE BEFORE START WHEN REQUIRED.
VERIFY WEB + API + WORKER.
NEVER CALL A FAILED HEALTH GATE SUCCESS.
USE TERMINAL FOR BOOTSTRAP/RECOVERY, THEN AUTOMATE THE REPEATABLE FIX.
```

This is the Shia App Factory default delivery method until explicitly superseded by a newer versioned standard.