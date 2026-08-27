# Shia Factory → GStack Extension Contract

Shia Factory consumes GStack as the generic engineering execution layer. Shia-specific governance stays in this repository.

## Boundary

GStack owns reusable engineering workflows such as:

- product framing/specification
- planning and decomposition
- code review
- independent review / Codex review when available
- browser QA
- regression testing
- security review
- shipping/deployment workflows
- learning/handoff workflows

Shia Factory owns:

- task state and readiness
- consequence-based risk tiers
- dependency graph / write ownership
- task contracts
- context and memory budgets
- worker/model/capability routing
- evidence requirements
- exact-candidate receipts
- repair budgets
- human-approval requirements
- memory-promotion policy
- project-specific acceptance criteria

GStack stages never override Shia Factory policy.

## Default significant-feature gauntlet

```text
Factory READY task
→ GStack /office-hours (when product framing is unclear)
→ /spec
→ /autoplan
→ Shia task-contract validation
→ implementation worker
→ /review
→ independent reviewer / Codex pass when warranted
→ /qa or browser QA
→ /cso for security/risk-bearing surfaces
→ Shia convergence + exact-candidate receipt
→ /ship only when delivery is authorized
→ /learn
→ GBrain candidate lesson
```

For trivial T0/T1 changes, use the smallest reliable subset. Do not force maximum ceremony onto low-risk work.

## Shia skills GStack workers should use

- `skills/factory-runtime-wiring/SKILL.md`
  - use for task execution, checkpoints, state transitions, review, receipts, steering, idempotency, and resumability
- `skills/factory-learning-loop/SKILL.md`
  - use after meaningful success/failure to capture verified lessons and propose bounded harness improvements

## Control-plane rule

A GStack worker may propose a candidate, test it, review it, and return evidence. It may not independently mark a Shia Factory task ACCEPTED unless the Shia control-plane invariants permit the transition.

## Context rule

GStack receives a task-specific context packet, not the entire organizational brain. Repository truth, relevant ADRs/specs, proven procedural memory, and necessary tools are disclosed progressively.

## Review steering

When a candidate is rejected, send a bounded steering packet:

- failed criterion
- reviewer evidence
- permitted change surface
- remaining repair budget

Do not widen permissions merely because more context was supplied.

## Resumability

Every GStack task should be able to leave a model-neutral checkpoint containing:

- task ID/state
- task contract/spec
- exact candidate
- completed/pending verification
- evidence
- side-effect receipts
- repair budget
- blocker
- exact next action

Another authorized worker should be able to resume from this state without replaying the prior chat.

## Learning

`/learn` output is a candidate lesson, not automatically authoritative memory. Promote only after Shia Factory/GBrain provenance, confidence, duplication/conflict, and authority rules are satisfied.

## Upgrade policy

GStack remains upstream. Do not vendor or fork upstream skill bodies into Shia Factory unless a concrete compatibility requirement forces it.

After a GStack upgrade:

1. read upstream release notes;
2. verify expected slash commands/skill surfaces still exist;
3. run one representative Shia spec/review/QA loop;
4. run Shia Factory tests;
5. update this bridge only when a contract actually changed.
