# Chat Idea Traceability Ledger

Purpose: preserve the Factory ideas developed in the long-running AI-development training/watch thread
without confusing researched tools with adopted architecture.

Statuses:

- **ENFORCED** — represented by executable policy/tests in this repository.
- **SPECIFIED** — version-controlled operating rule/template; runtime integration may still be pending.
- **EXISTING** — already present in the repository/runtime before this change.
- **BENCHMARK** — external candidate to evaluate; not an architectural dependency.
- **DEFER** — useful idea, intentionally not activated until a demonstrated bottleneck justifies it.

## Core engineering system

| Idea | Status | Repository representation |
| --- | --- | --- |
| Build Deep, Run Flat | SPECIFIED | `FACTORY_CONSTITUTION.md` |
| Customer outcome before implementation | SPECIFIED / ENFORCED | Constitution + task contract validation |
| Specification-driven development | SPECIFIED | `OPERATING_SYSTEM.md` |
| Definition of Done before coding | ENFORCED | acceptance criteria required by `validateTaskContract` |
| Versioned contracts / loose coupling | SPECIFIED | Operating System + templates; project-specific contracts remain per project |
| Vertical slices before premature abstraction | SPECIFIED | Operating System |
| Domain/business logic separated from presentation/provider details | SPECIFIED | Constitution/Operating System architecture principles |
| Architecture Decision Records | SPECIFIED | ADR template |
| Decision packets / task packets | SPECIFIED | Task + Context templates |
| Evidence packets | ENFORCED / SPECIFIED | evidence policy + Evidence Packet template |
| Test pyramid / deterministic verification before expensive browser review | SPECIFIED | risk/evaluation routing |
| Browser/runtime verification | ENFORCED by tier contract requirement | evidence kinds + risk policy |
| Convergence: spec ↔ implementation, not only green tests | SPECIFIED | Operating System |
| Requirement traceability | SPECIFIED | traceability template |
| Exact-candidate receipts | ENFORCED | `receiptAuthorizesCandidate` + Receipt template |
| Accepted Work Unit as unit of progress | ENFORCED | `acceptedWorkUnit` |
| Completion latency | SPECIFIED | golden metrics |
| Repository as system of record | SPECIFIED | `AGENTS.md` + Operating System |
| Progressive disclosure / concise AGENTS map | SPECIFIED | `AGENTS.md` |
| Golden principles / factory constitution | SPECIFIED | `FACTORY_CONSTITUTION.md` |
| Repository garbage collection / gardener | SPECIFIED | Operating System |
| Harness engineering | SPECIFIED | Operating System |
| Repeated friction becomes harness improvement | SPECIFIED | Harness Friction template |
| Poka-yoke / mistake-proofing | SPECIFIED | Constitution enforcement ladder |

## Agent orchestration

| Idea | Status | Repository representation |
| --- | --- | --- |
| One responsibility per agent | SPECIFIED | task-contract scope/ownership |
| Cheapest proven worker for the role | SPECIFIED | model routing |
| Agent Scorecard | SPECIFIED | template + metrics |
| Cost per accepted task | SPECIFIED | golden metrics |
| Human attention per accepted task | SPECIFIED | golden metrics |
| Bounded autonomy | ENFORCED | task-contract validation |
| Max two default repair attempts | ENFORCED | `validateTaskContract` |
| Financial autonomy/budget ceiling | ENFORCED at contract validation level | `maxCostUsd` field; runtime spend-stop integration still pending |
| Risk-tiered loops T0–T4 | ENFORCED / SPECIFIED | `RiskTier`, evidence/review rules |
| Read-only reconnaissance for high-risk work | ENFORCED | `riskRequiresReadOnlyRecon` |
| Separate reconnaissance from execution | SPECIFIED | Recon template + Operating System |
| Dependency graph / Ready Queue | ENFORCED at policy level | dependencies + `readyToRun` |
| Parallelize discovery; serialize conflicting decisions | ENFORCED / SPECIFIED | `workMayRunConcurrently` |
| Worktree / isolated workspace strategy | EXISTING / SPECIFIED | runtime workspace model + Operating System |
| Multi-agent hierarchy does not equal coordination | SPECIFIED | Constitution |
| Explicit write ownership | ENFORCED at contract policy level | concurrent write check |
| No conflicting autonomous objectives over same mutable resource | ENFORCED / SPECIFIED | concurrency policy |
| Evidence-weighted dissent / protect minority evidence | SPECIFIED | Constitution + review section |
| Builder and reviewer separation | SPECIFIED | Operating System |
| Different model family for critical review where practical | SPECIFIED | reviewer section |
| Advisor-agent escalation before whole-task escalation | SPECIFIED | model routing |
| Human attention routing | SPECIFIED | Operating System |
| Durable agent execution / event logs | EXISTING / SPECIFIED | BORIS events + Operating System |
| Project state survives conversation | SPECIFIED | Project State template |
| Agent handoff cost | SPECIFIED | golden metrics |
| Session/action auditability | EXISTING / SPECIFIED | BORIS events/evidence + Operating System |

## Context and capability engineering

| Idea | Status | Repository representation |
| --- | --- | --- |
| Context Compiler | SPECIFIED | Operating System + Context Packet |
| Minimum sufficient context | SPECIFIED | Constitution + AGENTS map |
| Store broadly, retrieve narrowly | SPECIFIED | Constitution |
| Model-specific memory dosage | ENFORCED at policy primitive level | `memoryBudgetFor` |
| Lazy/dynamic capability loading | SPECIFIED | capability routing |
| Minimum necessary tools | EXISTING / SPECIFIED | BORIS tool authorization + Constitution |
| Permission is code, not prompt text | EXISTING | `boris/src/policy/permissions.ts` per `CLAUDE.md` |
| Portable context does not imply portable authority | SPECIFIED | external integration rules |
| Shared repository intelligence | SPECIFIED | external benchmark candidates below |
| Retrieval must expose uncertainty/coverage | SPECIFIED | memory/retrieval principles |

## Memory / Second Brain concepts

| Idea | Status | Repository representation |
| --- | --- | --- |
| Separate factual/episodic/procedural/failure/research memory | EXISTING / SPECIFIED | BORIS memory categories + Operating System |
| Candidate vs authoritative memory | ENFORCED at policy level | `MemoryAuthority` + `canPromoteMemory` |
| Provenance required | EXISTING / ENFORCED | BORIS memory + promotion policy |
| Epistemic states observed/inferred/assumed/decided/proven/stale/conflicting | ENFORCED | `EpistemicState` |
| Hypotheses cannot silently become truth | ENFORCED | `canPromoteMemory` |
| Shared retrieval != shared write authority | SPECIFIED | Constitution/Operating System |
| Cross-project memory default read-only | SPECIFIED | Operating System |
| Contradictions surfaced rather than silently resolved | SPECIFIED | Constitution |
| Memory engine is replaceable infrastructure | SPECIFIED | Operating System |
| Repository truth beats remembered truth | SPECIFIED | `AGENTS.md` + Constitution |
| Memory-type routing | SPECIFIED | Operating System |
| Experience capture != knowledge governance | SPECIFIED | Operating System |

## Security, safety, and governance

| Idea | Status | Repository representation |
| --- | --- | --- |
| Minimum authority / default deny | EXISTING / SPECIFIED | BORIS permissions + Constitution |
| Human approval for restricted actions | EXISTING / ENFORCED in runtime | `CLAUDE.md` safety rules |
| Secrets never logged/read from credential paths | EXISTING | runtime safety rules |
| Skill supply-chain review | SPECIFIED | Operating System |
| Harness/governance changes receive elevated review | SPECIFIED | Constitution + AGENTS map |
| Approval bound to exact candidate | ENFORCED | receipt policy |
| Risk follows consequence, not diff size | ENFORCED / SPECIFIED | risk tiers |
| Agent isolation must be adversarially tested | SPECIFIED | memory/security guidance |
| Local model != trusted model | SPECIFIED | Operating System |
| Security reviewer intelligence != execution authority | SPECIFIED | Constitution |

## Local / multi-model strategy

| Idea | Status | Repository representation |
| --- | --- | --- |
| Local-first execution tier for private/repetitive bounded work | SPECIFIED | model routing |
| Mid-tier worker class | ENFORCED / SPECIFIED | `WorkerProfile` + memory budget |
| Frontier models reserved for higher-value judgment | SPECIFIED | model routing |
| Deterministic code for stable mechanics | SPECIFIED | Constitution |
| Cloud cost avoided by local workers | SPECIFIED | golden metrics |
| Model independence | EXISTING / SPECIFIED | BORIS providers + Factory Constitution |

## Marketing operating system

| Idea | Status | Repository representation |
| --- | --- | --- |
| Outcome → Mechanism → Proof → Offer → Action | SPECIFIED | Operating System |
| Demonstrate before explaining | SPECIFIED | marketing section |
| Market the mechanism, not vague adjectives | SPECIFIED | marketing section |
| Conversion bottleneck thinking | SPECIFIED | marketing section |
| Hypothesis → experiment → evidence → lesson | SPECIFIED | Marketing Experiment template |
| Proof Library | SPECIFIED | Operating System |
| Evidence-backed claims | SPECIFIED | Operating System |
| Message-market match before automation | SPECIFIED | Operating System |
| Stable brand constitution with creative variation beneath it | SPECIFIED | constitutional hierarchy concept; project-specific brand package pending |

## Personal operating discipline

| Idea | Status | Repository representation |
| --- | --- | --- |
| Process over emotional goal chasing | SPECIFIED | Operating System personal discipline |
| Resume before starting | SPECIFIED | Project State template |
| Exact next action | SPECIFIED | Project State template |
| Limit WIP | SPECIFIED | Constitution + Operating System |
| Capture new ideas into backlog/parking lot | SPECIFIED | Operating System |
| Close loops / finish and verify | SPECIFIED | accepted-work-unit philosophy |
| Shutdown runway for next session | SPECIFIED | Project State template |
| Research ends in ADOPT/TEST/REJECT/DEFER | SPECIFIED | Recon template |
| New != important | SPECIFIED | external evaluation policy |

## External infrastructure discussed — candidates, not dependencies

These tools were researched in the thread. Recording them here prevents rediscovery while avoiding
premature lock-in.

| Candidate | Problem it may solve | Status |
| --- | --- | --- |
| MCP 2026-07-28+ | model-neutral tool/capability bus; stateless routing | BENCHMARK / architectural protocol candidate |
| Hermes Agent | persistent sessions, scheduler, skills, messaging, subagents | BENCHMARK |
| Multica | multi-agent work/control plane, reviews, costs, worktrees | BENCHMARK |
| AgentMemory | cross-agent memory engine with provenance/versioning | BENCHMARK |
| GrayMatter | cross-agent MCP memory/federation | BENCHMARK |
| Oracle Agent Memory | governed database-style memory architecture | BENCHMARK / research reference |
| Codebase Memory MCP | shared structural repository index | BENCHMARK |
| GitHub Spec Kit | specification/convergence workflow reference | BENCHMARK / workflow reference |
| Gentle-AI RDD | exact-candidate receipt-driven workflow | BENCHMARK / technique borrowed |
| OpenAI/Codex worktrees + repository instructions | isolated coding execution | EXISTING workflow reference |
| Claude Managed Agents | budgets/advisor/repo-skill patterns | BENCHMARK / pattern reference |
| Muse persistent subagents/event-log ideas | durable long-running worker pattern | BENCHMARK / pattern reference |
| n8n | deterministic automation/integration layer | DEFER until a measured automation bottleneck exists |

## Models discussed — benchmark pool, not permanent assignments

Model names change rapidly. The factory should keep roles stable and let models earn them through
scorecards.

Potential categories discussed in the thread include frontier Codex/GPT models, Claude, Kimi, Gemini,
local Liquid/LFM workers, Muse/Glimmer-class local workers, and future open-weight models.

No model name belongs in the Constitution. Routing decisions are empirical and replaceable.

## Runtime integration backlog created by this ledger

The following ideas are specified/policy-coded but are not yet fully wired into the live BORIS runtime:

1. Persist Factory Task Contract fields alongside runtime `Task` records.
2. Enforce risk-tier gates automatically before runtime mutation.
3. Enforce `maxCostUsd` as a real spend-stop boundary.
4. Persist exact-candidate receipts and invalidate them on candidate change.
5. Promote/demote memory through epistemic-state policy rather than ad-hoc writes.
6. Add dependency-aware Ready Queue scheduling to the runtime worker selector.
7. Add conflict-aware write-ownership checks across parallel workers.
8. Add agent scorecard persistence and routing based on accepted-task evidence.
9. Add requirement traceability and convergence records.
10. Surface human-attention events in HQ: blocked, failed, permission request, budget reached,
    conflicting evidence, candidate ready for review.
11. Add harness-friction records and periodic bounded repository-gardener work.
12. Add supply-chain review metadata for third-party skills/plugins.

This backlog is intentionally explicit: documentation does not make these shipped behaviors. Each item
must earn `EXISTING/ENFORCED` status through implementation plus evidence.
