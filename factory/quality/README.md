# Factory Quality

Canonical home for the permanent Quality Gate contracts and evidence schemas.

- `quality-gate-receipt.schema.json` defines the exact-candidate receipt.
- `evidence-admission.schema.json` defines provenance-verified evidence.
- `risk-gate-policy.json` defines deterministic activation and authority rules.
- `boris/src/quality/quality-gate.ts` is the single Phase 5 receipt engine.
- `boris/tests/`, `agents/tests/`, GitHub Actions and GStack `/review`, `/qa` and `/cso` remain evidence sources; none may independently accept a Shia task.

Raw evidence is audit-only until an authorized adapter verifies provenance and execution-record integrity. Visual artifacts require a trusted review record, retained bytes, computed SHA-256 match and exact-candidate binding; their admitted verdict is canonicalized from that trusted record. Cristian approvals resolve from existing Factory approval storage; caller strings never count.
