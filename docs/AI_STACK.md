# Shia Factory AI Stack

This document defines the current integration boundary between Shia Factory, GStack, and GBrain.

## Responsibilities

### Shia Factory

Owns the organizational control plane:

- project/task state
- dependency readiness
- risk tiers
- permissions and approval boundaries
- task contracts
- context/memory/tool budgets
- model/worker routing
- verification requirements
- exact-candidate receipts
- repair/escalation policy
- project-specific specifications and acceptance criteria
- memory promotion/governance

### GStack

Provides the generic engineering execution system:

- product framing/specification
- planning/decomposition
- implementation/review workflows
- browser QA/regression testing
- security review
- shipping/deployment procedures
- engineering learning/handoff workflows

Consume GStack upstream. Do not copy upstream skill bodies into this repository merely for convenience.

Shia-specific extension contract: `gstack/SHIA_FACTORY_EXTENSION.md`.

### GBrain

Provides persistent memory/retrieval infrastructure:

- cross-session recall
- semantic/source retrieval
- entity/project memory
- synthesis/gap analysis when warranted
- context packs / delta retrieval when configured
- durable fact and procedural-memory storage

The source pin for this repository is `.gbrain-source` = `shia-factory`.

Memory seed ledger: `gbrain/FACTORY_MEMORY_SEED.md`.

GBrain is not the authority that overrides repository truth, Factory state, or explicit decisions.

## Current topology

```text
Cristian / project intent
        ↓
Shia Factory control plane
        ↓
Task Contract + Risk + Ready state
        ↓
GStack / worker execution
        ↓
Candidate + Evidence
        ↓
Shia verification/review/receipt
        ↓
Accepted state
        ↓
GBrain candidate lesson / durable memory
```

## Runtime skills

- `skills/factory-runtime-wiring/SKILL.md`
- `skills/factory-learning-loop/SKILL.md`

These are Shia-specific skills and may be used by Claude, Codex, GStack workers, or other authorized workers.

## Memory verbs

Where available, prefer the narrow GBrain verbs surface:

- `recall`
- `remember`
- `entity`
- `synthesize`
- `forget`
- `context_pack`
- `delta`

Every durable write should carry provenance. Never put secrets into ordinary shared memory.

## Default significant-task flow

```text
/office-hours (only when framing is unclear)
→ /spec
→ /autoplan
→ Shia task-contract validation
→ implementation worker
→ /review
→ independent review when required
→ /qa
→ /cso for risk-bearing surfaces
→ Shia convergence + exact-candidate receipt
→ /ship only when authorized
→ /learn
→ GBrain candidate lesson
```

Use a smaller path for low-risk work.

## Memory promotion

Do not treat `/learn`, worker summaries, or recalled history as authoritative by default.

Promote durable knowledge only after applying:

- provenance
- evidence
- epistemic state
- duplicate/conflict checks
- support/confidence
- scope/applicability
- explicit authority where required

## Recovery

The Factory task checkpoint, not GBrain memory, is the source of operational truth during an active task.

A checkpoint should carry enough state for another worker to resume:

- task/state
- contract/spec
- candidate
- completed/pending verification
- evidence
- operation receipts
- repair budget
- blocker
- exact next action

GBrain stores reusable lessons from the work, not the live task's only copy of state.

## Upgrade policy

GStack and GBrain move quickly. Prefer upgrade-and-verify over local forks.

After an upstream update:

1. read release notes;
2. verify expected tool/verb/skill surfaces;
3. run the GBrain memory round-trip;
4. run Shia Factory tests;
5. run one representative GStack spec/review/QA loop;
6. update adapters/bridge docs only when a real contract changed.

## Verification targets

GBrain:

```text
remember harmless Shia Factory fact with provenance
→ fresh session
→ recall by project/source
→ confirm provenance and currentness
```

GStack:

```text
one bounded task
→ spec
→ implementation/review
→ QA
→ Shia exact-candidate receipt
```

Do not deploy merely to prove integration.
