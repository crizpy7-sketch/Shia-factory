# Runtime Wiring v1

Runtime Wiring v1 is the first executable vertical slice of the Shia Factory control plane.

## Purpose

Prove one bounded task can travel through deterministic Factory policy without allowing the AI worker to decide its own readiness, verification, review, repair budget, or acceptance.

## Enforced path

```text
READY
→ RUNNING
→ VERIFYING
→ REVIEW
→ ACCEPTED
```

Failure paths:

```text
VERIFYING → REPAIR → RUNNING
REVIEW → REPAIR → RUNNING
repair budget exhausted → ESCALATED
invalid contract/dependency → BLOCKED
```

## Runtime authority

The control plane owns:

- readiness validation
- state transitions
- candidate identity
- evidence collection state
- bounded repair count
- review/receipt acceptance
- checkpoints and exact next action
- escalation

The worker owns bounded implementation work only.

## Checkpoint contract

Every runtime task checkpoint records:

- task ID
- current state
- worker ID
- exact candidate identity
- collected evidence
- repair attempts
- blocker
- exact next action
- update time

Another authorized worker can reconstruct the operational state from the checkpoint and repository without replaying private chain-of-thought or the previous chat transcript.

## Proof task

`RW-001` in `boris/tests/unit/runtime-wiring.test.ts` proves:

1. a valid task enters READY;
2. an authorized worker starts RUNNING;
3. an exact candidate enters VERIFYING;
4. missing evidence routes to REPAIR rather than acceptance;
5. passing evidence reaches REVIEW;
6. review is bound to the exact candidate;
7. an authorized exact-candidate receipt reaches ACCEPTED;
8. repair-budget exhaustion reaches ESCALATED;
9. a checkpoint can be resumed by another worker.

## Intentionally not included yet

Runtime Wiring v1 does not yet:

- spawn Claude/Codex/GStack processes;
- execute GitHub mutations or deployments;
- persist checkpoints to a database;
- seed GBrain automatically after acceptance;
- run browser verification itself;
- schedule parallel workers.

Those become later vertical slices only after this state-control loop is green and accepted.
