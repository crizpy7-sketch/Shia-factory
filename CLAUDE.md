# Shia App Factory — working agreement

This repository holds two things: the **Shia App Factory** (a browser workbench for composing
blocks) and **BORIS-001** (a portable named agent, and the runtime that executes him).

## Canonical directories

| Path | What it is | Rule |
| --- | --- | --- |
| `index.html`, `blocks/` | The Factory workbench and its block runtimes | Zero-build, self-contained HTML. No bundler, no framework |
| `agents/BORIS-001/` | BORIS's portable identity package | **Source of truth.** Read it; do not rewrite it |
| `agents/GARY-001/` | GARY's portable identity package | **Source of truth.** Read it; do not rewrite it |
| `agents/*.js`, `agents/tests/` | The Factory's agent layer (registry, routing, advisory, panels) | Plain scripts, no build step, tested with `node --test` |
| `assets/agents/boris-001/` | Avatar assets served by the Factory and the dashboard | Byte-identical to the package originals |
| `boris/` | The BORIS runtime: TypeScript, strict, Node 22 | Where all agent execution lives |
| `hq/` | The Headquarters: Office, Workshop, Lab, Records | Zero-build HTML. It reports state; it never invents it |
| `agents/hq.js` | The HQ data layer | Pure functions over the registry and live runtime, tested with `node --test` |

## Commands

Factory agent layer:

```sh
node --test agents/tests/*.test.mjs
```

BORIS runtime (from `boris/`):

```sh
npm install
npm run build          # tsc -> dist/
npm run typecheck      # strict, must be clean
npm run lint           # eslint, must be clean
npm test               # unit + integration
npm run test:security  # adversarial suite
npm run test:e2e       # real repair, real process kill, real recovery
npm run gauntlet       # everything, in order
node dist/src/cli.js run   # API + dashboard + worker + scheduler
```

## Headquarters

The building has four rooms and one address. `node dist/src/cli.js run` serves all of it:

| Route | Room |
| --- | --- |
| `/hq` | Office · Workshop · Lab · Records |
| `/factory` | The block workbench, unchanged |
| `/` | The BORIS Control Center |

Rules for the building:

- **The office may only display what the runtime returned.** No task counts, uptimes or costs are
  synthesised. Offline means offline, with the command to start it.
- **A provisional agent is labelled everywhere.** An agent registered without a transferred identity
  package shows `AWAITING IDENTITY PACKAGE`, is excluded from `established()`, and cannot be given
  work. Registration is not identity.
- **An agent without a runtime is labelled everywhere too.** His seat says `No runtime connected`,
  his assignee option is disabled, and his panel repeats it on every run. An identity package is not
  a running agent.
- **Only mapped static files are served.** `STATIC_ROUTES` in `boris/src/api/server.ts` is an
  allowlist; nothing else in the repository is reachable over HTTP.
- **Cross-origin access is off by default.** `BORIS_ALLOWED_ORIGINS` opts specific origins in. There
  is no wildcard, because a browser page on an unknown origin must not be able to queue agent work.

## Agent roster

| Agent | Council | State |
| --- | --- | --- |
| BORIS-001 | Influencers Council | Package transferred and checksum-verified. Hosted by the `boris/` runtime. Runtime recertification **PENDING** |
| GARY-001 | Growth Council | Package transferred and imported verbatim. **No runtime in this repository executes him.** Certification `IDENTITY_SEEDED_RESEARCH_IN_PROGRESS_RUNTIME_RECERTIFICATION_PENDING` |

Three states, and the building must keep them distinct: *no package* (provisional), *package but no
runtime* (Gary), *runtime but no certification* (Boris). Collapsing them is how a registration gets
mistaken for a working agent.

Gary-specific rules:

- **His simulation notice is not decoration.** GARY-001 is a Shia-owned fictionalised identity. It is
  not Gary Vaynerchuk, does not impersonate him, and must not imply endorsement or affiliation. The
  notice travels in `registry.js` and renders wherever he does.
- **His ledgers arrived populated. They are not edited.** Five research packets, five verification
  reports, six research-ledger records, five changed beliefs, one failure-library seed. Rule 5 below
  cuts both ways: an empty ledger is not filled in, and a full one is not trimmed or "tidied".
- **His provenance is weaker than Boris's**, and says so. Boris shipped a publisher-signed SHA256
  manifest; Gary shipped none, so `agents/GARY-001/SHA256_MANIFEST.json` was taken at import. It
  detects later drift; it proves nothing about what happened before the archive arrived.
- **No avatar art shipped.** `avatar_art_supplied: false`, and a monogram placeholder stands in,
  named as one. Do not generate art and present it as his.
- **He may not be given work here.** The Office disables his assignee option and the panel states on
  every run that no certified Gary runtime answered. His execution host is the separate Gary Vee
  Growth Agent application, which is not vendored into this zero-build repository.

## Identity rules

1. **Never rewrite an agent's identity to fit a model or a host.** `agents/BORIS-001/**` and
   `agents/GARY-001/**` are transferred state under a SHA256 manifest. The runtime loads them; the
   runtime does not edit them. Where two packages disagree in shape — Gary declares twelve authority
   keys with different names from Boris's five — the surfaces adapt, not the packages.
2. **Never mark a certification checkbox as passed.** `agents/BORIS-001/evals/RECERTIFICATION.md`
   stays `PENDING` until the gauntlet is actually executed and Cristian approves. A test asserts
   this; if it fails, the fix is to revert the tick, not to change the test.
3. **Hosting is not identity.** Claude Code, or any model, is a runtime host. Integration succeeding
   is not evidence of runtime fidelity.
4. **Better architecture must not destroy accumulated state.** Identity, evidence, skills,
   certifications, research and failure ledgers survive refactors. If a redesign would lose them,
   the redesign is wrong.
5. **Ledgers arrive as they arrive.** Boris's failure library and research ledger came in empty;
   they are not reconstructed from plausible-sounding guesses, and when the originals are recovered
   they are merged by provenance. Gary's came in populated; they are not summarised, deduplicated or
   corrected. A packet whose provenance was missing promoted nothing, and it stays that way.

## Source-of-truth rules

- **Never claim BORIS functionality exists merely because it is described in documentation.**
  Verify the implementation and the runtime evidence. Documentation describes what is; it does not
  make it so.
- **Never create a replacement repository when the canonical one can be evolved safely.** Adapt
  paths, preserve semantics.
- The Factory's block protocol, glue engine, and record handoff are shipped behaviour. Changing them
  needs the regression tests in `agents/BORIS-001/evals/BORIS-EXAM-001-diagnosis.md` to pass.

## Safety rules

- Permission decisions are code, not prompt text. `boris/src/policy/permissions.ts` is the only
  place a tool call is authorised. Do not add a tool that bypasses it.
- Subprocesses get a minimal environment. Never pass the parent environment to a child.
- Secrets are never logged, never returned by the API, and never read from disk: credential-shaped
  paths are denied outright rather than escalated to approval.
- The scripted provider is a **test double**. It must stay gated behind
  `BORIS_ALLOW_TEST_PROVIDER=true` and must keep reporting `isTestDouble: true`.
- Restricted actions — deploy, publish, spend, credentials, production data — require a human
  approval record. Auto-approving them in code is a defect, not a convenience.

## Completion criteria

A change is done when:

1. `npm run typecheck` and `npm run lint` are clean.
2. The relevant tests pass, and new behaviour has a test that would fail without it.
3. The claim of success is backed by an actual command and its output, quoted in the report.
4. Anything unverified is labelled unverified — in the code, the UI and the report.

## Prohibited shortcuts

- Fake progress: hardcoded statuses, simulated workers, fabricated logs, invented memory, fake cost
  figures, placeholder buttons presented as working. If a value is unknown, show `unknown`.
- Mocking the agent loop and calling it an end-to-end test. E2E means real files, real processes.
- Weakening a test to make it pass. Fix the code, or state plainly that the test encodes the wrong
  requirement and why.
- `any`, `@ts-ignore` and non-null assertions as a way past the type system.
- Widening `BORIS_WORKSPACE_ROOTS` to make a permission denial go away.
