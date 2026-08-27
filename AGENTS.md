# Shia App Factory — agent map

This file is the short, model-neutral entry point for any coding agent working in this repository.
It is a map, not an encyclopedia. Follow links to deeper sources instead of expanding this file.

## Product outcome

Build a reliable, evidence-driven AI software factory that can accept bounded work, route it to the
right worker, verify the result independently, preserve lessons, and let another authorized worker
resume without reconstructing chat history.

## Start here

1. `FACTORY_CONSTITUTION.md` — non-negotiable factory law.
2. `docs/factory/OPERATING_SYSTEM.md` — task lifecycle, risk tiers, context, memory, evidence,
   orchestration, receipts, and learning loops.
3. `docs/AI_STACK.md` — Shia Factory / GStack / GBrain responsibility boundaries.
4. `skills/factory-runtime-wiring/SKILL.md` — executable operating procedure for state, checkpoints,
   verification, steering, resumability, and duplicate-safe side effects.
5. `skills/factory-learning-loop/SKILL.md` — verified memory promotion and bounded harness improvement.
6. `gstack/SHIA_FACTORY_EXTENSION.md` — how upstream GStack workflows plug into Shia governance.
7. `gbrain/FACTORY_MEMORY_SEED.md` — compact durable memory seed and provenance contract.
8. `CLAUDE.md` — existing repository-specific working agreement and runtime safety rules.
9. `boris/src/factory/operating-system.ts` — deterministic factory policy primitives.
10. `boris/tests/unit/factory-operating-system.test.ts` — executable policy tests.

## Sources of truth

| Question | Authority |
| --- | --- |
| What code exists now? | Repository source code |
| What must this product do? | Versioned specifications / acceptance criteria |
| Why was an architecture choice made? | ADR / decision record |
| What work is active/ready/blocked/done? | Authoritative project/task state |
| What have agents learned from prior work? | Provenanced memory / failure / research records |
| How is a repeatable procedure performed? | Versioned Skill |
| What proves a claim? | Test, command output, receipt, screenshot, log, or other evidence artifact |

Memory never silently overrides current repository truth. A conflict is surfaced and resolved.

## Commands

Factory agent layer:

```sh
node --test agents/tests/*.test.mjs
```

BORIS runtime, from `boris/`:

```sh
npm run typecheck
npm run lint
npm test
npm run test:security
npm run test:e2e
npm run gauntlet
```

GBrain seed/verification on Windows:

```powershell
./scripts/seed-gbrain-factory-playbook.ps1
```

## Factory lifecycle

```text
OUTCOME
→ SPECIFICATION
→ ACCEPTANCE CRITERIA
→ RISK CLASSIFICATION
→ DEPENDENCY / READY CHECK
→ TASK CONTRACT
→ MINIMUM CONTEXT + MEMORY + CAPABILITIES
→ ISOLATED WORK
→ TEST / RUNTIME OR BROWSER VERIFICATION
→ INDEPENDENT REVIEW
→ CONVERGENCE CHECK
→ EXACT-CANDIDATE RECEIPT
→ ACCEPTED / REPAIR / ESCALATE
→ PROJECT STATE UPDATE
→ LESSON / MEMORY PROMOTION
→ HARNESS IMPROVEMENT WHEN RECURRING FRICTION EXISTS
```

Use the smallest process that reliably controls the consequence of failure. A typo does not need an
architecture council. Payments, authentication, production infrastructure, privacy, irreversible
writes, and safety-critical work do.

## Non-negotiables

- Prompts communicate boundaries; code and permissions enforce them.
- No implementation task starts without observable acceptance criteria.
- The worker does not redefine DONE to match what it happened to build.
- High-risk actions require stronger review and, where specified, human approval.
- Maximum autonomous repair attempts are bounded; repeated failure escalates with evidence.
- Multiple agents do not receive conflicting write authority over the same mutable resource.
- Parallelism follows dependency readiness, not the number of agents available.
- A reviewer approves an exact candidate. Materially changing that candidate invalidates the review.
- Majority agreement is not evidence. Preserve dissent when it introduces unique evidence.
- Store knowledge broadly; retrieve task-relevant context narrowly.
- Shared memory does not imply shared write authority.
- Hypotheses are not facts, decisions, or authoritative memory.
- Repeated failures should become tests, constraints, skills, tooling, or other harness improvements.
- Stable repeatable mechanics should become deterministic code; use models for judgment and
  uncertainty.
- Reviewer steering can add information but cannot silently add authority.
- Work must survive worker/session replacement through durable checkpoints.
- Consequential side effects must be safe to retry without accidental duplication.
- Only verified trajectories may teach authoritative procedural memory or trusted skills.
- Upstream GStack workflows remain subordinate to Shia Factory task/risk/acceptance policy.
- GBrain recall is evidence/context, not authority over current repository truth.
- Never fabricate progress, evidence, costs, memory, certifications, runtime state, or success.

## Change discipline

Before mutation on a non-trivial task, identify:

- customer/product outcome;
- task scope;
- risk tier;
- dependencies;
- allowed/read-only/forbidden paths;
- allowed/forbidden tools;
- acceptance criteria;
- required evidence;
- repair and cost budgets;
- escalation conditions.

If the task requires broader authority than the contract grants, stop and escalate. Do not silently
widen scope.

## Documentation discipline

- Update or supersede existing truth; do not create `final-v2-really-final` duplicates.
- Keep `AGENTS.md` short and navigational.
- Put project-specific implementation truth in the repository, not in chat-only context.
- Treat changes to permissions, routing, evaluators, memory promotion, budgets, or the factory
  constitution as harness/governance changes requiring elevated review.
