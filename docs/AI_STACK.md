# Shia Factory AI Stack

This document defines the first production integration between Shia Factory, GStack, and GBrain.

## Responsibilities

### Shia Factory

Owns the product-specific layer:

- orchestration and project routing
- named agent identity and authority
- councils and advisory review
- reusable Shia Blocks
- visual Factory UI and future avatar/VR surfaces
- Shia-specific acceptance criteria, policies, and domain knowledge

### GStack

Provides the generic software-factory operating system:

- product framing and specification
- CEO/design/engineering/DX review
- debugging and staff-engineer review
- browser QA and regression testing
- security review
- shipping/deployment/canary workflows
- context handoff and project learning
- independent Codex review

We consume GStack upstream rather than vendoring its skills.

### GBrain

Provides persistent agent memory and retrieval:

- cross-session memory
- semantic search
- entity/relationship knowledge
- synthesis and gap analysis
- code/source indexing when configured
- the MEMORY_VERBS v1 agent protocol

The Shia UI and agent hierarchy remain ours; GBrain is the memory substrate beneath them.

## Phase 1 topology

Start locally. Do not require a VPS or shared cloud brain to prove the architecture.

```text
Shia Factory repo
      |
      +--> GStack skills (upstream install)
      |
      +--> GBrain MCP --surface verbs
              |
              +--> local PGLite brain
```

Once this round-trip works reliably, migrate or connect the brain to a server/Supabase deployment for multi-machine and always-on agents.

## Recommended GBrain sources

Create one logical source per durable project/domain:

- shia-factory
- remixr
- shia-baby
- gary
- boris
- rumor-runner
- games-vr
- marketing
- second-brain
- research

The goal is one personal/company brain with explicit sources first. Add separate brain databases later only when ownership or access-control boundaries require them.

## Memory contract

Preferred MCP surface: `gbrain serve --surface verbs`.

The stable verbs are:

1. `recall` — retrieve facts and relevant evidence.
2. `remember` — save one attributed durable fact.
3. `entity` — resolve a known project/person/company/agent card.
4. `synthesize` — combine evidence across pages; use sparingly because it is expensive.
5. `forget` — expire an obsolete fact with an audit trail.
6. `context_pack` — deterministic session-start/rehydration bundle.
7. `delta` — retrieve what changed since a prior boundary.

Every Shia memory write should carry provenance. Project facts should be attached to the relevant entity/source. Never use ordinary shared memory for secrets.

## Default engineering gauntlet

For a significant feature:

```text
/office-hours
    -> /spec
    -> /autoplan
    -> implement
    -> /review
    -> /codex (when available)
    -> /qa
    -> /cso (risk-bearing surfaces)
    -> /ship
    -> /land-and-deploy (only with merge/deploy authorization)
    -> /learn
```

Shia advisory agents can be inserted before implementation or at review gates. Their authority remains defined by their agent package/registry.

Example:

```text
Idea
 -> office-hours
 -> Boris systems/reliability challenge
 -> autoplan
 -> implementation worker
 -> GStack review
 -> Codex adversarial pass
 -> QA/security
 -> ship
 -> learn -> GBrain
```

## Install

### Windows / PowerShell

From the repository root:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
./scripts/bootstrap-ai-stack.ps1
```

Git for Windows (including `bash`) and Bun must be installed first.

### macOS / Linux / Git Bash

```bash
bash scripts/bootstrap-ai-stack.sh
```

The scripts are intentionally conservative:

- update or clone upstream GStack
- install GStack for detected hosts
- install GBrain from Garry Tan's GitHub repo via Bun
- initialize a local PGLite brain only when no brain exists
- register the narrow MEMORY_VERBS MCP surface with detected Claude/Codex hosts when possible
- do not create, merge, or deploy project code
- do not provision cloud infrastructure

## Verification

Run:

```bash
gbrain doctor
```

Then verify the memory round-trip using a harmless test fact:

```bash
gbrain remember "Shia Factory GBrain integration verification" --provenance "bootstrap verification" --entity project/shia-factory
gbrain recall --entity project/shia-factory
```

Start a fresh AI coding session and ask it to recall the verification fact. The important test is cross-session recovery, not merely reading identity files in the same session.

For GStack, run one small end-to-end loop on this repo:

```text
/office-hours
/spec
/review
/qa-only
```

Do not ship merely to test installation.

## Team mode

Once local use is stable, enable GStack team mode from the installed GStack checkout and let its upstream tooling manage shared skill availability. Keep Shia-specific routing in this repository; do not copy upstream skill bodies here.

## Phase 2

After Phase 1 is verified:

1. move/connect GBrain to a persistent server or Supabase deployment;
2. register Gary, Boris, Factory orchestration, and coding workers against the same approved brain surface;
3. give each Shia project a source pin/trust policy;
4. add a Factory memory inspector showing recalled facts, provenance, source, confidence/evidence, and last change;
5. add workflow telemetry so the Factory can display which gauntlet stage each project is in;
6. expose approved GStack actions as Factory controls rather than raw slash commands;
7. later add GPU/model routing and visual avatars without coupling those concerns to memory or engineering methodology.

## Upgrade policy

GStack and GBrain are fast-moving upstream dependencies. Prefer upgrade-and-verify over local forks.

After an upstream update:

1. read release notes/changes;
2. run upstream setup/upgrade;
3. verify memory round-trip;
4. run Shia Factory tests;
5. run a representative GStack review/QA flow;
6. only then update any Shia wrappers whose contracts changed.
