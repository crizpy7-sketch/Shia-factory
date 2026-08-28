# Permanent Workforce v1

Phase 4 consolidates the Factory behind exactly five canonical role IDs. The callable adapter is `boris/src/identity/permanent-workforce.ts`; it reuses the Phase 2 registries and Phase 3 orchestrator.

## Invocation semantics

`factory/registry/invocation-contracts.json` is the source of truth for required inputs. The adapter returns the exact missing field names as `needs-input` or `evidence-gap` before dispatch. It never fills absent context.

Shia Core executes only through the Phase 3 orchestrator. BORIS and Gary return explicit route-only dispatch records pointing to their preserved runtime/identity surfaces; this is not a claim that they performed work. Design Director remains a bounded route-only adapter. In the Phase 5 candidate, Quality Gate admits raw evidence through `boris/src/quality/evidence-admission.ts` before delegating complete validated packets to the single deterministic engine at `boris/src/quality/quality-gate.ts`; missing or unverified inputs return an evidence gap before evaluation.

| Canonical role | Consolidated implementation | Bootstrap/certification state |
| --- | --- | --- |
| `shia-core` | Phase 3 orchestrator, operating system and runtime wiring | Phase 3 approved |
| `boris` | `agents/BORIS-001`, `boris/`, hosted roster profile and existing tests | Existing runtime mapped; identity certification claims unchanged |
| `gary` | `agents/GARY-001`, deterministic Inspector, hosted roster profile and Growth pack | Existing runtime mapped; identity/history preserved |
| `design-director` | Invocation/authority contracts, Design pack, registered design-tool ownership and callable adapter | Phase 4 bootstrap approved in merged PR #13; full certification not claimed |
| `quality-gate` | Exact-candidate receipt engine consuming existing tests, CI and advisory/GStack evidence | Phase 5 candidate operational; self-certification forbidden; Cristian approval pending |

## Legacy consolidation

The machine-readable mapping is `factory/registry/legacy-role-mapping.json`.

- **KEEP / compatibility:** `BORIS-001` → BORIS; `GARY-001` → Gary.
- **MERGE / absorbed capability:** Gary Tan and Gary Vee → Gary; Premium Experience Director → Design Director; Testing Agent → Quality Gate; Vibe Coder, Algorithm Agent and Systems Agent → BORIS.
- **DEPRECATE without deletion:** Marketing Chief and Growth Council → Gary; PED → Design Director; Reviewer → Quality Gate; Influencers Council and Engineering Council → BORIS.

Deprecated names resolve to their permanent owner. Historical code, packages, council records and documentation remain in place and do not become sixth permanent roles.

## Bootstrap boundary

Callable does not mean independently certified. Design Director requires product context, target platforms, user flows, a candidate/design artifact and acceptance criteria before routing. Quality Gate requires the complete evidence-packet context defined by its invocation contract. A role evaluating a candidate that implements or changes itself always requires independent review and Cristian approval. Cristian's approval of merged PR #13 records only the Phase 4 bootstrap; the Phase 5 candidate requires its own exact-candidate approval.

## Deferred

Phase 6 Shelf admission and Michel OS remain untouched.
