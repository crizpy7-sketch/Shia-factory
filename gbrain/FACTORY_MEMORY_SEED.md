# Shia Factory GBrain Memory Seed

Source pin: `shia-factory`

This file defines durable candidate facts/procedures to seed into GBrain. It is intentionally compact. GBrain is a retrieval substrate, not the authority that overrides repository truth.

## Durable facts

1. Shia Factory owns task state, risk, permissions, evidence requirements, exact-candidate acceptance, repair budgets, and escalation. AI workers are replaceable execution units.
2. GStack is the generic software-engineering execution layer. Shia Factory consumes it upstream rather than vendoring its skills.
3. GBrain is the persistent memory/retrieval substrate. Memory never silently overrides current repository truth.
4. Work must survive workers: checkpoints preserve enough state for another authorized worker to resume without replaying chat history.
5. Consequential side effects require durable operation identities and duplicate-safe retry semantics.
6. Feedback may widen worker understanding but must not silently widen permissions.
7. Store knowledge broadly and retrieve narrowly according to project, task, risk, provenance, confidence, model capability, and context budget.
8. Observations, inferences, assumptions, decisions, proven knowledge, stale knowledge, and conflicts are distinct epistemic states.
9. A single agent trajectory normally creates a candidate lesson, not an authoritative rule.
10. Only verified trajectories with provenance and evidence are eligible to become procedural memory or reusable skills.
11. Repeated friction should improve the harness through the smallest durable change rather than stronger future prompting.
12. Workers may propose skill/procedural-memory improvements but cannot self-authorize governance, permission, risk, acceptance, or safety-policy changes.
13. Autonomous maintenance should prefer boring, bounded, independently verifiable wins and refuse broad high-risk refactors without explicit authorization.
14. Parallelism follows dependency readiness and write ownership, not the number of agents available.
15. Majority agreement is not proof; unique contradictory evidence must be preserved and evaluated.
16. The primary Factory success metric is accepted work throughput, not tokens, commits, code volume, or number of active agents.
17. Stable deterministic mechanics should bypass model reasoning when no judgment is required.
18. Read authority and write authority are separate capabilities.
19. Approval binds to the exact candidate that was reviewed; material changes require refreshed review/evidence.
20. Runtime Wiring v1 is the current implementation priority over adding more conceptual Factory subsystems.

## Procedural memories

### Significant task flow

```text
OUTCOME
→ SPEC
→ ACCEPTANCE CRITERIA
→ RISK
→ DEPENDENCY/READY CHECK
→ TASK CONTRACT
→ MINIMUM CONTEXT/MEMORY/TOOLS
→ RUNNING
→ VERIFYING
→ REVIEW
→ CONVERGENCE
→ EXACT-CANDIDATE RECEIPT
→ ACCEPTED / REPAIR / ESCALATED
→ PROJECT STATE
→ VERIFIED LESSON
```

### Recovery flow

```text
load checkpoint
→ inspect candidate/evidence/side-effect receipts
→ identify exact pending action
→ execute only missing work
→ verify
→ persist updated checkpoint
```

### Consequential side-effect flow

```text
intent
→ durable operation ID
→ check receipt
→ execute only if receipt absent
→ persist receipt
→ checkpoint
```

### Learning flow

```text
experience
→ provenance
→ evidence
→ epistemic classification
→ candidate lesson
→ duplicate/conflict check
→ support/confidence
→ approval/promotion when justified
→ selective retrieval on future task
```

### Rejected-candidate steering

```text
review failure
→ failed criterion + evidence
→ bounded reviewer steering
→ unchanged permission scope
→ remaining repair budget
→ worker repair
→ fresh verification and exact-candidate review
```

## Memory-writing rule

When seeding these facts into GBrain, attach provenance such as:

`Shia Factory repository: gbrain/FACTORY_MEMORY_SEED.md`

Attach the project entity/source `project/shia-factory` where supported.

Do not write secrets, credentials, customer-private data, or transient task chatter into shared memory.

## Verification

After seeding:

```text
1. start a fresh coding-agent session;
2. recall Shia Factory control-plane responsibilities;
3. recall the recovery/idempotency rule;
4. confirm provenance points back to this repository seed;
5. verify the retrieved memory does not override a conflicting current repository rule.
```
