# Permanent Workforce v1

Phase 4 consolidates the Factory behind exactly five canonical role IDs. The callable adapter is `boris/src/identity/permanent-workforce.ts`; it reuses the Phase 2 registries and Phase 3 orchestrator.

## Invocation semantics

`factory/registry/invocation-contracts.json` is the source of truth for required inputs. The adapter returns the exact missing field names as `needs-input` or `evidence-gap` before dispatch. It never fills absent context.

Shia Core is the only role executed directly by this adapter, and it executes only through the Phase 3 orchestrator. BORIS and Gary return explicit route-only dispatch records pointing to their preserved runtime/identity surfaces; this is not a claim that they performed work. Design Director and Quality Gate likewise return bounded route-only records with no produced artifacts. Contract outputs remain empty until the owning runtime or capability actually produces them.

| Canonical role | Consolidated implementation | Bootstrap/certification state |
| --- | --- | --- |
| `shia-core` | Phase 3 orchestrator, operating system and runtime wiring | Phase 3 approved |
| `boris` | `agents/BORIS-001`, `boris/`, hosted roster profile and existing tests | Existing runtime mapped; identity certification claims unchanged |
| `gary` | `agents/GARY-001`, deterministic Inspector, hosted roster profile and Growth pack | Existing runtime mapped; identity/history preserved |
| `design-director` | Invocation/authority contracts, Design pack, registered design-tool ownership and callable adapter | Phase 4 bootstrap approved in merged PR #13; full certification not claimed |
| `quality-gate` | Existing tests, CI, advisory/GStack review references and callable exact-candidate adapter | Phase 4 bootstrap approved in merged PR #13; self-certification forbidden; full Phase 5 certification not claimed |

## Legacy consolidation

The machine-readable mapping is `factory/registry/legacy-role-mapping.json`.

- **KEEP / compatibility:** `BORIS-001` → BORIS; `GARY-001` → Gary.
- **MERGE / absorbed capability:** Gary Tan and Gary Vee → Gary; Premium Experience Director → Design Director; Testing Agent → Quality Gate; Vibe Coder, Algorithm Agent and Systems Agent → BORIS.
- **DEPRECATE without deletion:** Marketing Chief and Growth Council → Gary; PED → Design Director; Reviewer → Quality Gate; Influencers Council and Engineering Council → BORIS.

Deprecated names resolve to their permanent owner. Historical code, packages, council records and documentation remain in place and do not become sixth permanent roles.

## Bootstrap boundary

Callable does not mean executed or independently certified. Design Director requires product context, target platforms, user flows, a candidate/design artifact and acceptance criteria before routing. Quality Gate requires a task contract, risk tier, exact candidate, acceptance criteria and required-evidence specification before routing. A role evaluating a candidate that implements or changes itself always returns uncertified with Cristian approval required. Cristian's approval of merged PR #13 records the exact Phase 4 bootstrap through repository governance; it does not satisfy future candidate review or the full Phase 5 certification system.

## Deferred

Phase 5 owns the complete Quality & Safety evidence packet and dedicated browser, visual, accessibility, security, performance and adversarial gates. Phase 6 Shelf admission and Michel OS are untouched.
