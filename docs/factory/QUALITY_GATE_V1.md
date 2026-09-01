# Permanent Quality Gate v1

Phase 5 upgrades the permanent `quality-gate` role without adding a role or skill. `boris/src/quality/evidence-admission.ts` is the trust boundary; only its admitted input reaches `boris/src/quality/quality-gate.ts`.

## Control-plane boundary

Shia Core remains the orchestration and acceptance authority. Quality Gate may produce a pass/reject/block/evidence-gap receipt for one exact candidate, but cannot execute dangerous actions or mark the Factory task accepted. GStack `/review`, `/qa`, `/cso` and independent-review surfaces may contribute evidence; GStack cannot declare a Shia task accepted.

The receipt always records:

- `qualityGateMayAcceptTask: false`;
- `gstackMayAcceptTask: false`;
- `qualityEvidenceGrantsActionAuthority: false`.

## Canonical evidence packet

The canonical JSON Schema is `factory/quality/quality-gate-receipt.schema.json` at version `1.2.0`.
The unchanged historical `1.1.0` contract is retained at
`factory/quality/quality-gate-receipt-v1.1.schema.json`; old receipts keep their original meaning and
are not silently reinterpreted as scoped receipts. A canonical `1.2.0` receipt binds:

- task ID, project/application and repository;
- exact candidate SHA and branch;
- risk tier and the complete task-contract snapshot;
- acceptance criteria and required evidence;
- current exact-candidate evidence and excluded stale evidence;
- each criterion result and each individual gate result;
- known limitations, rework requests and remaining repair budget;
- approval gates and independent reviewer identity/source when required;
- evaluation scope, scope status and a scope binding;
- an immutable scope-aware receipt digest and evaluation time.

Final states are deterministic:

| State | Meaning |
| --- | --- |
| `pass` | Every applicable gate and criterion has passing exact-candidate evidence; this is not task acceptance or action authority. |
| `reject` | Current-candidate evidence proves a failure and bounded BORIS rework remains available. |
| `blocked` | Structure, authority, reviewer independence, approval, self-certification or repair-budget rules prevent progress. |
| `needs-evidence` | No failure is proven, but required evidence is missing, unavailable, stale or structurally inadequate. |

Evidence from another SHA is retained under `staleEvidence` but never counted. Raw claims remain in `rawEvidence`/`unverifiedEvidence` and produce `needs-evidence`.

## Evaluation scopes

The same permanent evaluator mints both scopes. An application may not hand-author fields and call the
result a Factory receipt.

| Scope | Evidence evaluated | Production observation | Authorization |
| --- | --- | --- | --- |
| `pre-deployment-release-readiness` | Every applicable requirement that can logically exist before deployment, including code/CI, runtime/image provenance, security/adversarial review, relevant performance, backup/restore, rollback/bootstrap and independent review | Exactly `not-evaluated-pre-deployment`; never `pass` | Cristian deployment approval remains pending and independently required; Quality grants no authority |
| `full-lifecycle` | The normal Quality gates plus trusted production observation when declared required | `pass`, `fail`, `needs-evidence` or `not-applicable` according to admitted evidence and policy | Existing Factory governance remains authoritative |

Pre-deployment criteria requiring `production-observation` or `human_approval` are recorded as
`not-evaluated`, not passed. They do not block the narrower readiness verdict, and the receipt makes
their later requirement explicit. Full lifecycle cannot pass a required production-observation gate
without exact-candidate evidence admitted through a trusted `production-observer` adapter.

Legacy inputs that omit scope are normalized to `full-lifecycle` with production observation
`not-applicable`, preserving the pre-1.2 evaluator behavior for non-deployment callers. Deployment
work must select the scope and production-observation requirement explicitly. An explicitly scoped
full-lifecycle evaluation defaults observation to `required`, and a deploy lifecycle cannot opt out
by declaring observation `not-applicable`.

`scopeBindingId` hashes schema version, task, project, repository, candidate, branch and scope. The
scope binding is included in the immutable receipt body, and `receiptId` hashes that complete body.
Consequently, receipts for different scopes cannot substitute for one another even when every other
identity field is the same. Persisted receipt filenames also include scope.

## Evidence admission

Workers, CI, BORIS, browser runners, production observers and GStack submit raw claims. Authorized adapters resolve independent run/artifact records and attach source type, source/run/artifact ID, exact candidate, collector, observation time, verified state and integrity digest. Admission canonical-copies, scope-normalizes and deep-freezes the verified record and packet before branding them for the evaluator, preventing mutation after verification. The evaluator rejects objects not produced by this boundary. Generic `human-approval` evidence is never admitted; Cristian authorization resolves independently through Factory governance.

## Risk-to-gate matrix

| Risk | Automated | Browser/visual + accessibility | Security/adversarial | Performance | Approval |
| --- | --- | --- | --- | --- | --- |
| T0 | Typecheck, lint, unit, integration | Only for user-facing/UI changes | Smallest reliable baseline | Only when a sensitive surface is declared | Contract-defined |
| T1 | Typecheck, lint, unit, integration | Only for user-facing/UI changes | Smallest reliable baseline | Only when a sensitive surface is declared | Contract-defined |
| T2 | Typecheck, lint, unit, integration | Required for user-facing/UI changes | Activates for auth, private data, permissions, payments, secrets, destructive or infrastructure surfaces | Activates for frontend/API/data/AI-media signals | Contract-defined |
| T3 | Typecheck, lint, unit, integration | Required when applicable | Security plus adversarial evidence and an independent reviewer are mandatory | Activates when a performance surface or material consequence is declared | Contract-defined human gate |
| T4 | Typecheck, lint, unit, integration | Required when applicable | Security plus adversarial evidence and an independent reviewer are mandatory | Activates when a performance surface or material consequence is declared | Cristian approval bound to exact candidate is mandatory |

`factory/quality/risk-gate-policy.json` is the machine-readable policy. Security consequence overrides diff size.

## Browser and visual evidence

For a user-facing or UI-path change, a passing packet requires both:

1. real-browser critical-flow evidence with browser version, viewport/device and tested surfaces;
2. a retained visual artifact path and SHA-256 digest.

A browser claim requires a verified runner record; method/version/viewport fields alone do not count. Visual evidence requires a trusted artifact/review record, allowed retained path, existing bytes and computed SHA-256 matching both recorded digests. The admitted visual status and findings come from that trusted record, never from the caller's raw claim.

## Accessibility

Applicable UI work requires deterministic tooling or observed interaction evidence, tested surfaces, failures with severity and explicit untested surfaces. Source inspection alone cannot claim compliance. A P0–P2 failure on a required path rejects the candidate.

## Security, performance and permission

T3/T4 always require security and adversarial evidence. T2 activates on meaningful security surfaces. T0/T1 use the smallest reliable baseline. Findings remain bound to the candidate and become rework while budget remains.

Performance activates only for declared performance-sensitive frontend, latency-sensitive API/backend, large-data/database, resource-intensive AI/media, or material T3/T4 consequence. A pass requires explicit threshold/measurement pairs; prose is not a benchmark.

Merge, deploy, external publish/send, spending/payment, destructive database work and irreversible infrastructure require a verified existing Factory/BORIS approval record bound to approval ID, task, action, exact candidate, Cristian, decision time and provenance. `approvedBy: Cristian` strings do not count. Secret access remains denied. Quality Gate records authority but never grants or executes it.

## Convergence

```text
candidate SHA A
→ Quality Gate receipt rejects failed criteria
→ bounded rework request owned by BORIS
→ candidate SHA B
→ all SHA A evidence is stale
→ Quality Gate reruns for SHA B
```

The default repair budget remains at most two. Exhaustion blocks and escalates. Quality Gate does not repair the candidate it judges, and it cannot self-certify a candidate that implements or changes Quality Gate. A scoped pre-deployment Quality pass for a self-changing candidate still leaves the Cristian approval gate pending and cannot accept or merge the task. Cristian approved the exact Phase 5 implementation in merged PR #14 (`d2b1baa2005c10ac1b2c25a26a8c705acc6c444e`); future self-changing candidates still require independent review and Cristian approval.

## Production adapter limitation

Production CI, BORIS, browser and GStack evidence adapters require environment-specific wiring to authoritative run and artifact stores. Their integration must be proven during a real application lifecycle before the Factory may claim those sources work end to end. Until then, unavailable or unverified evidence remains `needs-evidence`.
