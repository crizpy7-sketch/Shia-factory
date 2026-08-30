# Orchestrator

Canonical home for Shia Core intake, reuse search, risk classification, context compilation and routing. The Phase 3 deterministic implementation extends the existing runtime at `boris/src/factory/orchestrator-core.ts`; runtime wiring remains at `boris/src/factory/runtime-wiring.ts`. These compatibility paths remain stable.

Phase 6 adds the governed Shelf at `factory/shelf/` and `boris/src/factory/reusable-shelf.ts`.
Orchestration now records a deterministic `REUSE`, `EXTEND` or `CREATE` Shelf decision. Legacy
provenance discovery remains compatible, but only trusted exact-source/dependency admission plus
canonical capability or explicit-alias compatibility may produce exact reuse. Fuzzy similarity can
only support discovery or `EXTEND`.
