# Permanent Quality Gate v1

Phase 5 upgrades the permanent `quality-gate` role. It does not create another agent, council, reviewer, security role or standalone skill. The deterministic engine is `boris/src/quality/quality-gate.ts`; the permanent workforce adapter invokes that engine after validating the normalized role contract.

## Control-plane boundary

Shia Core remains the orchestration and acceptance authority. Quality Gate may produce a pass/reject/block/evidence-gap receipt for one exact candidate, but cannot execute dangerous actions or mark the Factory task accepted. GStack `/review`, `/qa`, `/cso` and independent-review surfaces may contribute evidence; GStack cannot declare a Shia task accepted.

The receipt always records:

- `qualityGateMayAcceptTask: false`;
- `gstackMayAcceptTask: false`;
- `qualityEvidenceGrantsActionAuthority: false`.

## Canonical evidence packet

The JSON Schema is `factory/quality/quality-gate-receipt.schema.json`. A receipt binds:

- task ID, project/application and repository;
- exact candidate SHA and branch;
- risk tier and the complete task-contract snapshot;
- acceptance criteria and required evidence;
- current exact-candidate evidence and excluded stale evidence;
- each criterion result and each individual gate result;
- known limitations, rework requests and remaining repair budget;
- approval gates and independent reviewer identity/source when required;
- an immutable receipt digest and evaluation time.

Final states are deterministic:

| State | Meaning |
| --- | --- |
| `pass` | Every applicable gate and criterion has passing exact-candidate evidence; this is not task acceptance or action authority. |
| `reject` | Current-candidate evidence proves a failure and bounded BORIS rework remains available. |
| `blocked` | Structure, authority, reviewer independence, approval, self-certification or repair-budget rules prevent progress. |
| `needs-evidence` | No failure is proven, but required evidence is missing, unavailable, stale or structurally inadequate. |

Evidence from another SHA is retained under `staleEvidence` for audit but is never counted. Persisted receipts use `<task-id>-<candidate-sha>.json`, so a repair necessarily creates a new receipt.

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

A screenshot alone does not prove persisted or server-side behavior. A missing browser runtime, unavailable physical device or absent screenshot produces `needs-evidence`. Quality Gate never synthesizes browser metadata or artifacts.

## Accessibility

Applicable UI work requires deterministic tooling or observed interaction evidence, tested surfaces, failures with severity and explicit untested surfaces. Source inspection alone cannot claim compliance. A P0–P2 failure on a required path rejects the candidate.

## Security, performance and permission

T3/T4 always require security and adversarial evidence. T2 activates on meaningful security surfaces. T0/T1 use the smallest reliable baseline. Findings remain bound to the candidate and become rework while budget remains.

Performance activates only for declared performance-sensitive frontend, latency-sensitive API/backend, large-data/database, resource-intensive AI/media, or material T3/T4 consequence. A pass requires explicit threshold/measurement pairs; prose is not a benchmark.

Merge, deploy, external publish/send, spending/payment, destructive database work and irreversible infrastructure require Cristian approval associated with the candidate. Direct secret access remains denied. Quality evidence records authorization but never grants it, and passing tests are never permission to deploy.

## Convergence

```text
candidate SHA A
→ Quality Gate receipt rejects failed criteria
→ bounded rework request owned by BORIS
→ candidate SHA B
→ all SHA A evidence is stale
→ Quality Gate reruns for SHA B
```

The default repair budget remains at most two. Exhaustion blocks and escalates. Quality Gate does not repair the candidate it judges, and it cannot self-certify a candidate that implements or changes Quality Gate. Cristian approval of the exact Phase 5 candidate remains required before merge.
