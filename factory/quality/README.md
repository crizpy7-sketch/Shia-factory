# Factory Quality

Canonical home for the permanent Quality Gate contracts and evidence schemas.

- `quality-gate-receipt.schema.json` defines the canonical scope-aware exact-candidate receipt at `1.2.0`.
- `quality-gate-receipt-v1.1.schema.json` preserves the historical unscoped `1.1.0` contract without redefinition.
- `evidence-admission.schema.json` defines provenance-verified evidence.
- `risk-gate-policy.json` defines deterministic activation and authority rules.
- `boris/src/quality/quality-gate.ts` is the single Phase 5 receipt engine.
- `boris/tests/`, `agents/tests/`, GitHub Actions and GStack `/review`, `/qa` and `/cso` remain evidence sources; none may independently accept a Shia task.

Raw evidence is audit-only until an authorized adapter verifies provenance and execution-record integrity. Visual artifacts require a trusted review record, retained bytes, computed SHA-256 match and exact-candidate binding; their admitted verdict is canonicalized from that trusted record. Cristian approvals resolve from existing Factory approval storage; caller strings never count.

The one permanent evaluator mints `pre-deployment-release-readiness` and `full-lifecycle` receipts.
Scope participates in both the immutable scope binding and receipt digest. A pre-deployment pass
explicitly defers production observation and never grants deployment authority; a required full
lifecycle observation can pass only through admitted exact-candidate production-observer evidence.
