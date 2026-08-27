# Skill: Factory Runtime Wiring

## Purpose

Use this skill when a Shia Factory task must move from READY to an independently verified terminal state without relying on a worker conversation as authority.

The control plane owns state, risk, permissions, evidence requirements, repair budgets, candidate identity, acceptance, and escalation. Workers own bounded reasoning and implementation only.

## Required lifecycle

```text
READY
→ validate task contract
→ classify risk
→ check dependencies
→ load minimum context/memory/tools
→ RUNNING
→ produce exact candidate
→ VERIFYING
→ REVIEW
→ ACCEPTED / REPAIR / ESCALATED
```

Never skip a required state because a worker says the task is done.

## Runtime invariants

1. A task cannot enter RUNNING without observable acceptance criteria.
2. T2+ work cannot reach ACCEPTED without the required review path.
3. T4 work cannot reach ACCEPTED without explicit human authorization.
4. High-risk work starts with bounded read-only reconnaissance when the contract requires it.
5. Repair attempts are bounded. Default maximum is 2 unless the task contract says otherwise.
6. Review binds to an exact candidate. Materially changing the candidate invalidates the receipt.
7. Consequential side effects require durable operation IDs and duplicate-safe retry behavior.
8. Two concurrent workers may not hold conflicting write authority over the same mutable resource.
9. A worker may receive new reviewer steering without receiving broader permissions.
10. Runtime state and evidence must be durable enough for another worker to resume.

## Verification hierarchy

Use the highest practical verification layer needed by the risk and user outcome:

```text
static checks
→ unit/integration tests
→ runtime verification
→ browser/device verification
→ outcome validation
```

The worker proposes completion. The verifier establishes whether the acceptance criteria hold.

## Checkpoint contract

Every meaningful execution state should be resumable from:

- task ID
- current state
- task contract/spec reference
- exact candidate identity
- completed checks
- pending checks
- evidence references
- repair attempts remaining
- blockers
- exact next action
- completed side-effect receipts

Do not solve resumability by copying entire chat histories.

## Deterministic versus model work

Bypass the model when no judgment is required.

Prefer deterministic read-only operations for:

- task state retrieval
- test receipt retrieval
- candidate SHA retrieval
- evidence lookup
- repository metadata
- approved memory retrieval

Use a model for:

- diagnosis
- uncertain planning
- code generation
- ambiguous review
- synthesis across conflicting evidence

Human-gate consequential authority such as deploy, publish, spend, production data mutation, permission changes, or other irreversible actions when policy requires it.

## Steering packet

When REVIEW rejects a candidate, return a bounded steering packet containing:

- failed acceptance criterion
- evidence
- reviewer comment
- authorized change surface
- remaining repair budget
- unchanged permission scope

Feedback may widen understanding; it must not silently widen authority.

## Stagnation detection

Stop or escalate when repeated loops produce no meaningful progress, for example:

- same searches repeated
- no new evidence
- no new hypothesis
- no material candidate change
- repair budget exhausted

Unlimited loops are prohibited.

## Idempotency pattern

For consequential actions:

```text
intent
→ operation ID
→ check existing receipt
→ execute only if absent
→ persist receipt
→ checkpoint
```

Examples: PR creation, deployment, publishing, customer messaging, purchases, payments, deletion, database mutation, external notifications.

## Evidence packet

A successful task should be able to produce, where applicable:

- acceptance criteria result
- changed paths
- exact candidate SHA/digest
- test outputs
- runtime/browser evidence
- reviewer result
- side-effect receipts
- remaining known limitations
- final terminal state

## Failure handling

Classify failures as one or more of:

- model
- specification
- context
- memory
- tool
- environment
- test
- permission
- process
- dependency

If recurrence is plausible, create a candidate harness improvement rather than merely prompting the next worker to try harder.

## Done

A work unit is ACCEPTED only when the control plane can prove that the required acceptance, evidence, review, candidate, permission, and side-effect invariants are satisfied.
