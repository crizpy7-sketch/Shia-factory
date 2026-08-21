# Shia App Factory Constitution

Version: 1.0.0
Status: Proposed implementation baseline

This constitution is the smallest set of non-negotiable laws that all Shia App Factory workers,
reviewers, routers, harnesses, and projects inherit. Project rules may narrow these laws but may not
weaken them without an explicit constitutional change.

## Law 1 — Customer outcome before implementation

Every meaningful build starts from an observable user or operational outcome. Architecture, agents,
frameworks, and models are means, not the objective.

**Verify:** the task contract names the intended outcome.
**Failure action:** return the task to clarification rather than coding an undefined result.

## Law 2 — Definition of Done exists before execution

A worker cannot responsibly finish work whose finish line is undefined. Non-trivial implementation
requires observable acceptance criteria and the evidence needed to verify them.

**Verify:** acceptance criteria are non-empty and testable.
**Failure action:** task remains `backlog` or `blocked` until criteria exist.

## Law 3 — Minimum necessary authority, context, and capability

Workers receive only the files, tools, secrets, memory, context, and write authority required for the
current task. Available capability does not imply authorized capability.

**Verify:** task contract includes path/tool boundaries and an explicit risk tier.
**Failure action:** deny out-of-contract action and escalate rather than widening authority silently.

## Law 4 — Evidence outranks confidence and consensus

Agent claims, confidence, eloquence, and majority votes do not establish correctness. Important
claims require appropriate evidence. Unique contradictory evidence must be preserved during
synthesis and review.

**Verify:** accepted work links evidence to acceptance criteria; dissent with unique evidence is
recorded.
**Failure action:** status remains `review` or `blocked`.

## Law 5 — Critical behavior is independently verified

Testing depth scales with consequence. Security, privacy, authentication, payments, production data,
irreversible actions, infrastructure, and other high-risk work require stronger verification than
cosmetic or isolated low-risk changes.

**Verify:** required verification gates are present for the task risk tier.
**Failure action:** reject or escalate the candidate.

## Law 6 — Exact candidates receive approval

Approval applies to the exact reviewed candidate, not to a task title or intention. A material change
after approval invalidates that approval and requires refreshed evidence/review.

**Verify:** receipt binds approval to a candidate identifier/hash.
**Failure action:** receipt becomes stale and delivery is blocked.

## Law 7 — The factory learns from verified experience

Repeated failures, friction, and successful procedures must improve future work through tests,
constraints, skills, tooling, documentation, memory, or other harness changes. Hypotheses do not
become authoritative memory merely because an agent produced them.

**Verify:** memory records preserve provenance and epistemic state; recurring failures are reviewed
for harness improvement.
**Failure action:** leave knowledge as candidate/provisional or create a harness-improvement item.

## Constitutional invariants

These rules support the seven laws and are mandatory unless superseded by a versioned constitutional
change:

1. **Build Deep, Run Flat.** Complex reasoning is acceptable during design/build; production runtime
   behavior should be deterministic and state-driven wherever practical.
2. **Models are replaceable workers.** Project state, specifications, contracts, evidence, skills,
   and governed knowledge are durable organizational assets.
3. **Conversations are coordination, not authority.** Durable project state survives chat sessions
   and model changes.
4. **Repository truth beats memory.** Learned memory may explain history; it cannot silently
   override current source/specification truth.
5. **Store broadly, retrieve narrowly.** Memory/context is budgeted by task and worker capability.
6. **Parallelize discovery, serialize conflicting decisions.** Concurrent work is permitted only
   where dependencies and ownership allow it.
7. **No conflicting autonomous objectives over the same mutable resource.** Arbitrate first.
8. **Hierarchy is not coordination.** Agent roles never replace explicit ownership, dependencies,
   write boundaries, evidence, and merge/review gates.
9. **Risk follows consequence, not diff size.** Tiny authentication changes can be higher risk than
   huge documentation changes.
10. **Repair loops are bounded.** Default autonomous repair budget is two attempts before escalation
    unless an explicit policy grants otherwise.
11. **Financial autonomy is bounded.** Automated work may have explicit cost budgets; exceeding them
    blocks or escalates work rather than continuing silently.
12. **Healthy autonomous work stays quiet.** Human attention is routed to ambiguity, risk,
    permission requests, failures, conflicts, budget limits, dissent, or final approval.
13. **Mechanics become code.** Repeatable deterministic steps should not consume reasoning turns when
    they can be encoded safely.
14. **Skills are supply-chain artifacts.** Third-party skills/plugins require source, license,
    permission, and security review before trust promotion.
15. **Memory writes are scoped.** Shared retrieval does not imply shared mutation authority.
16. **Epistemic states remain distinct.** Observed, inferred, assumed, decided, proven, stale, and
    conflicting information are not interchangeable.
17. **No fake progress.** Unknown remains unknown. Simulated results are labeled simulations.
18. **Quality includes experience.** Customer-facing software may require functional and visual/UX
    validation; green unit tests alone do not establish a good product.
19. **Validation differs from verification.** Building the implementation correctly does not prove
    the product solves the correct user problem.
20. **Limit WIP.** More active tasks and agents do not equal more accepted throughput.

## Governance

Changing this file is a harness/governance change. A constitutional change should include:

- the problem demonstrated by evidence;
- the proposed law/invariant change;
- tradeoffs and compatibility impact;
- migration implications for active tasks/agents;
- elevated review and explicit human approval.

The constitution should remain small. Technology-specific rules belong in project documentation,
skills, tests, or policy modules rather than expanding this document indefinitely.
