# GARY-001 — import record

This file records what arrived, what was imported, and what was **not**. It is written by the
integration, not by the package. Everything above it in this directory is transferred state.

## Source

`GaryVeeGrowthAgentGARY001v1.1.0.zip`, supplied by Cristian on 2026-08-15.

The archive contains two distinct things:

1. **`agent/gary-001/`** — GARY-001's portable identity package, version
   `0.4.0-multi-model-research-in-progress`.
2. **A Next.js growth application** (`src/`, `drizzle/`, `qa/`, `docs/`, `Dockerfile`,
   `package-lock.json`, …), release `1.1.0`, which is the application that *hosts* Gary.

## What was imported here

| Imported to | From the archive | Provenance |
| --- | --- | --- |
| `identity/`, `knowledge/`, `runtime/`, `integration/`, `README.md`, `INTEGRATION.md`, `RESEARCH_INTAKE.md` | `agent/gary-001/**` | Verbatim. Byte-for-byte, no edits |
| `host-application/skills/growth-operator/SKILL.md` | `skills/growth-operator/SKILL.md` | Verbatim, from the host application |
| `host-application/evals/**` | `evals/**` (cases, README, `results/latest.json`) | Verbatim, from the host application |
| `host-application/RELEASE_NOTES_GARY_001_v1.1.0.md` | repository root | Verbatim, from the host application |

`host-application/` is separated so provenance is never ambiguous: those files are accumulated
state that belongs to Gary (his skill, his eval evidence) but they did not ship inside the identity
package itself.

## What was not imported

The Next.js application source. This repository is zero-build by design (`index.html`, `blocks/`,
plain scripts) plus a dependency-free TypeScript runtime under `boris/`. Vendoring a Next.js app
with a Postgres schema and a 335 KB lockfile would not make Gary runnable here — it would make two
build systems live in one repository while Gary still had no execution path from the Factory.

The application still exists in the archive Cristian holds. **This repository currently hosts
Gary's identity and his policy layer, not his execution runtime.** That is stated on every surface
that shows him.

## Provenance is weaker than Boris's

BORIS-001 arrived with a publisher-supplied `SHA256_MANIFEST.json` — a checksum written *before*
transfer, so a modification in transit would be detectable.

Gary's package arrived **without one**. The `SHA256_MANIFEST.json` in this directory was generated
*at import time* from the files as they were extracted. It detects any change made from now on; it
cannot prove the files were unaltered before they reached here. That is a real difference in
evidence quality and it is not papered over.

## What is intact, and what is missing

Intact:

- Identity, personality, authority (12 declared boundaries), operating rules, research policy,
  memory domains, model-independence rule, 6 invocation aliases.
- The `simulation_notice`: Gary "is not Gary Vaynerchuk, does not impersonate him, and must not
  imply endorsement, affiliation, or personal access." This is carried into the registry so every
  surface can display it.
- **Non-empty knowledge.** Unlike Boris's, Gary's ledgers arrived with content: 6 research-ledger
  records, 5 changed-belief records, 5 research packets with 5 matching verification reports, and a
  research status table. None of it was regenerated, summarised or rewritten.
- The failure library contains exactly one seed placeholder. It stays one. It is not backfilled.

Missing, and not invented:

- **Avatar art.** No image of any kind ships in the archive. Gary keeps the generated monogram
  placeholder, and the registry records `avatar_art_supplied: false`.
- **A certified runtime.** `agent_passport.json` reports
  `IDENTITY_SEEDED_RESEARCH_IN_PROGRESS_RUNTIME_RECERTIFICATION_PENDING` with `certifications: []`
  and 10 required recognition tests, none of which has been run here.
- **A recertification document.** Boris has `evals/RECERTIFICATION.md` with explicit gates. Gary's
  package has the passport's test list but no gate document. One is not written on his behalf — the
  passport is quoted as-is.

## Integration rule

The registry entry in `agents/registry.js` restates this package for the UI. It is not a second
source of truth: `agents/tests/registry.test.mjs` fails if the two drift.
