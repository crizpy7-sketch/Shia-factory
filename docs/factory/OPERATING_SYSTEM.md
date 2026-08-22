# Shia App Factory Operating System

This document hard-codes the operating ideas developed for Shia Factory into one version-controlled
specification. It is intentionally model-neutral. Claude, Codex, Kimi, Gemini, Hermes, local models,
or future workers should inherit the same process.

## 1. System boundaries

The long-term architecture separates concerns:

```text
Cristian OS / project authority
        ↓
Shia App Factory policy + routing
        ↓
Agent control/runtime layer
        ↓
Claude / Codex / Kimi / Gemini / local workers
        ↓
Tests / browser / reviewers / evidence
        ↓
Authoritative state + proven memory
```

Within this repository today, the BORIS runtime provides substantial runtime machinery. The Factory
operating layer must extend existing contracts rather than replacing or fabricating them.

### Authority map

| Information | Authority |
| --- | --- |
| Current code | Repository |
| Product requirements | Versioned spec/acceptance criteria |
| Architecture rationale | ADR/decision records |
| Task/project state | Authoritative state record |
| Agent experience | Provenanced memory/failure/research ledger |
| Repeatable procedure | Versioned skill |
| Completion | Evidence + review/verification |

## 2. Work states

Factory-level work uses the following canonical states:

`backlog → ready → running → blocked/review → done`

`cancelled` is terminal. `blocked` returns to `ready` only when the blocker is explicitly resolved.
`review` returns to `ready` or `running` only through a traceable repair/revision decision.

A task is `ready` only when:

- dependencies are accepted;
- acceptance criteria exist;
- task contract passes validation;
- required authority/capabilities can be granted safely.

## 3. Risk tiers

Use consequence and uncertainty, not line count.

| Tier | Typical work | Minimum process |
| --- | --- | --- |
| T0 | copy, docs, trivial formatting | change → check |
| T1 | isolated low-risk component | spec → build → test/check |
| T2 | normal feature behavior | spec → plan → build → tests → runtime/browser verify |
| T3 | auth, payments, private data, important migrations | read-only recon → plan review → build → tests → independent review |
| T4 | production infrastructure, irreversible/regulated/safety-critical authority | recon → architecture/human approval → isolated implementation → full evidence/review |

A T3/T4 task must not become low-risk merely because the diff is small.

## 4. Task contract

Every non-trivial task should define:

- project/customer outcome;
- bounded task objective;
- risk tier;
- dependencies;
- allowed, read-only, and forbidden paths;
- allowed and forbidden tools/capabilities;
- acceptance criteria;
- required evidence;
- maximum repair attempts;
- optional financial budget;
- escalation conditions;
- reviewer requirements.

Prompts describe these boundaries. The harness enforces them.

## 5. Dependency-aware orchestration

Parallelism follows the Ready Queue, not the number of available agents.

```text
backlog
  ↓ dependencies satisfied
ready
  ↓ assigned
running
  ↓ candidate produced
review
  ↓ accepted
 done
```

Independent discovery/research may fan out. Competing implementations should not all mutate the same
source of truth. Prefer parallel research → single evidence synthesis → approved implementation.

Parallel coding workers use isolated workspaces/worktrees where practical. They may not pursue
conflicting autonomous objectives over the same mutable resource. Establish ownership before writes.

## 6. Context compiler

The worker receives the smallest sufficient packet assembled from:

- the current task contract;
- relevant specification and acceptance criteria;
- relevant ADRs;
- relevant project state;
- relevant procedural/failure memories;
- expected change surface;
- selected capabilities/tools;
- required verification commands.

Do not inject the entire Second Brain, every ADR, all chat history, or every tool schema simply because
it is available.

### Memory dosage

Workers may receive different memory budgets. Smaller/local workers should receive compact, highly
relevant lessons. Strong architecture/review models may receive broader relevant history when
benchmarks show it helps.

## 7. Epistemic state and memory promotion

Knowledge must preserve its status:

- `observed` — directly supported by evidence;
- `inferred` — conclusion drawn from evidence;
- `assumed` — unverified working assumption;
- `decided` — explicitly chosen policy/architecture;
- `proven` — repeatedly or directly verified authoritative claim;
- `stale` — once useful but no longer current;
- `conflicting` — credible evidence disagrees.

Agent hypotheses are candidate memory, not authoritative truth. Memory promotion requires provenance
and verification/repeated support appropriate to the consequence.

Shared retrieval does not grant shared write authority. Cross-project memory should default read-only
unless explicit scope grants mutation.

## 8. Builder / reviewer separation

The builder proposes a candidate. Verification and review establish acceptance.

Critical work should use a reviewer independent from the builder where practical, potentially from a
different model family or deterministic verifier.

The reviewer must preserve unique contradictory evidence. Majority vote never overrides a concrete
test, trace, log, or other higher-quality evidence merely because more agents agree.

## 9. Convergence and traceability

Green tests do not prove the full specification exists. Convergence compares:

`specification ↔ implementation ↔ verification/evidence`

Every important requirement should be traceable through:

`requirement → task → implementation → verification → evidence → acceptance`

Missing requirements create remediation work even when all existing tests pass.

## 10. Exact-candidate receipts

Review applies to the exact candidate that was inspected. A receipt records at minimum:

- task/project ID;
- base candidate identifier;
- reviewed candidate identifier/hash;
- changed paths;
- risk tier;
- evidence summaries;
- reviewer outcome;
- authorization state and time.

A material change to the candidate invalidates prior authorization.

## 11. Repair and escalation

Default repair behavior:

```text
attempt
→ verify
→ diagnose
→ repair 1
→ verify
→ repair 2
→ verify
→ still failing? STOP + ESCALATE
```

Escalation packet includes original spec, acceptance criteria, attempts, current diff/candidate,
evidence/test output, failure signature, and suspected cause. Failure becomes information, not
permission to wander indefinitely.

## 12. Model routing

Do not ask which model is universally smartest. Route by measured task performance.

Typical tiers:

- local/tiny: extraction, classification, formatting, simple bounded mechanics;
- mid-tier: ordinary implementation and debugging;
- frontier: difficult architecture, ambiguity, security review, stubborn failures;
- deterministic code: stable repeatable mechanics.

Primary metric: **cost per accepted task**. Supporting metrics include first-pass acceptance, repair
loops, unnecessary file changes, human minutes, regression rate, context size, tool calls, elapsed
time, and completion latency.

Escalate uncertainty to a stronger advisor before restarting an entire task with a more expensive
worker when practical.

## 13. Capability routing

Expose only the minimum tools/capabilities required for the task. Dynamic/lazy capability loading
reduces confusion, attack surface, and context.

A tool is usable only when both are true:

1. it is relevant to the task;
2. current policy grants authority.

Availability is not authorization.

## 14. Human attention routing

Healthy autonomous work should remain quiet. Surface human attention for:

- ambiguity that changes product intent;
- elevated permission requests;
- conflicting goals/evidence;
- failed verification or exhausted repairs;
- budget limits;
- constitutional/harness changes;
- high-risk final approval.

Track **human attention per accepted task** alongside AI cost.

## 15. Repository legibility

The repository should teach a new authorized agent how to work without Cristian reconstructing every
conversation.

`AGENTS.md` is a concise map. Detailed truth belongs in versioned specifications, ADRs, runbooks,
skills, tests, and evidence.

Documentation entropy is a defect. Update, supersede, or archive truth instead of creating competing
`final-v2` documents.

## 16. Harness engineering and garbage collection

Recurring friction is classified:

- model;
- specification;
- context;
- tool;
- environment;
- test;
- permission;
- process.

If recurrence is plausible, improve the harness. The preferred enforcement ladder is:

`memory → instruction → automated check → gate → invalid state impossible`

A periodic repository gardener may identify bounded drift such as duplicate utilities, stale docs,
dead code, inconsistent patterns, architecture violations, missing tests, obsolete dependencies, or
unused skills. Cleanup remains small, evidence-driven, and independently reviewed.

## 17. Skill lifecycle and supply-chain security

Do not convert every successful task into a skill.

Promote a skill when the procedure is:

- repeated;
- stable;
- non-duplicative;
- testable;
- useful across future tasks.

Third-party skills/plugins are executable supply-chain artifacts. Review source, license, requested
permissions, network behavior, secret access, and sandbox results before trust promotion. Deprecated
skills are archived rather than kept forever.

## 18. Durable state and handoffs

Conversations are coordination channels. Durable task/project state records where work actually is.
A handoff should allow another worker to resume from state + repository + evidence without Cristian
re-explaining the task.

Important autonomous runs should be reconstructable from task ID, agent/model, context/memory
references, tools granted/called, candidate produced, evidence, review, costs, and final state.

## 19. Durable event execution

Long-running agent work should prefer event logs/checkpoints that support restart/resume over fragile
single-chat context. The system should recover the last authoritative step after process failure
without inventing missing work.

## 20. Verification vs validation

Verification asks: **did we build it correctly?**
Validation asks: **did we build the correct thing for the user?**

Customer-facing applications require both when consequence justifies it. Real customer/player
behavior can overrule an AI evaluator's subjective confidence.

## 21. Marketing operating loop

The same evidence discipline applies to marketing:

`customer truth → hypothesis → creative/offer → publish/test → measure → lesson → next experiment`

Use `Outcome → Mechanism → Proof → Offer → Action` rather than leading with technology jargon.
Important factual/performance claims link to evidence. Build a Proof Library from permissioned real
customer outcomes, objections, testimonials, before/after results, and winning hooks.

Do not automate a message before proving it. AI can scale a bad message as efficiently as a good one.

## 22. Personal operating discipline

The human operator follows the same state discipline:

- capture new ideas into inbox/backlog rather than instantly activating them;
- resume active work before starting something exciting and new;
- limit WIP;
- work one project / one Ready task per focus block;
- close with evidence and an exact next action;
- measure accepted work units, not prompts or activity.

A small accepted unit is better than a giant permanent work-in-progress item.

## 23. Integration principles for external infrastructure

Evaluate existing open-source infrastructure before rebuilding schedulers, memory engines, worker
control planes, or MCP plumbing. Reuse only after license/security/benchmark review.

Keep organizational authority separate from replaceable infrastructure. A memory engine, agent
manager, Hermes-like runtime, Multica-like control plane, or MCP server may provide machinery without
becoming the authoritative brain.

Portable context never implies portable authority: imported tools, hooks, skills, secrets, and MCP
permissions require re-authorization in the destination runtime.

## 24. Golden metrics

The Factory should progressively measure:

- accepted work units;
- completion latency (Active → Accepted);
- cost per accepted task;
- first-pass acceptance;
- repair attempts;
- unnecessary files changed;
- human intervention minutes;
- human attention per accepted task;
- regression rate;
- verification coverage;
- context/memory size;
- tool calls;
- handoff cost;
- cloud cost avoided by reliable local workers.

Do not optimize for number of agents, token volume, prompts, commits, or generated lines of code.
