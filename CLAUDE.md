# Shia App Factory — working agreement

This repository holds two things: the **Shia App Factory** (a browser workbench for composing
blocks) and **BORIS-001** (a portable named agent, and the runtime that executes him).

## Canonical directories

| Path | What it is | Rule |
| --- | --- | --- |
| `index.html`, `blocks/` | The Factory workbench and its block runtimes | Zero-build, self-contained HTML. No bundler, no framework |
| `agents/BORIS-001/` | BORIS's portable identity package | **Source of truth.** Read it; do not rewrite it |
| `agents/*.js`, `agents/tests/` | The Factory's agent layer (registry, routing, advisory, panel) | Plain scripts, no build step, tested with `node --test` |
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
- **Only mapped static files are served.** `STATIC_ROUTES` in `boris/src/api/server.ts` is an
  allowlist; nothing else in the repository is reachable over HTTP.
- **Cross-origin access is off by default.** `BORIS_ALLOWED_ORIGINS` opts specific origins in. There
  is no wildcard, because a browser page on an unknown origin must not be able to queue agent work.

## Agent roster

| Agent | State |
| --- | --- |
| BORIS-001 | Identity package transferred and checksum-verified. Runtime recertification PENDING |
| GARY-001 | Registered, marketing discipline, strictest authority. **Identity package not yet received** |

Gary's entry in `agents/registry.js` is registration metadata supplied by Cristian — not transferred
state. It carries no cognitive model, no ledgers and no brand art, and it must not acquire any by
invention. When his files arrive they are imported verbatim, exactly as BORIS-001's were.

## Identity rules

1. **Never rewrite BORIS's identity to fit a model.** `agents/BORIS-001/**` is transferred state
   with a SHA256 manifest. The runtime loads it; the runtime does not edit it.
2. **Never mark a certification checkbox as passed.** `agents/BORIS-001/evals/RECERTIFICATION.md`
   stays `PENDING` until the gauntlet is actually executed and Cristian approves. A test asserts
   this; if it fails, the fix is to revert the tick, not to change the test.
3. **Hosting is not identity.** Claude Code, or any model, is a runtime host. Integration succeeding
   is not evidence of runtime fidelity.
4. **Better architecture must not destroy accumulated state.** Identity, evidence, skills,
   certifications, research and failure ledgers survive refactors. If a redesign would lose them,
   the redesign is wrong.
5. **Empty ledgers stay empty.** The failure library and research ledger arrived empty. They are not
   reconstructed from plausible-sounding guesses; when the originals are recovered they are merged
   by provenance.

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
