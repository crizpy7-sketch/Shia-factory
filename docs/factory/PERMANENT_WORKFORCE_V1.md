# Permanent Workforce v1

Phase 4 consolidates the Factory behind exactly five canonical role IDs. The callable adapter is `boris/src/identity/permanent-workforce.ts`; it reuses the Phase 2 registries and Phase 3 orchestrator.

| Canonical role | Consolidated implementation | Bootstrap/certification state |
| --- | --- | --- |
| `shia-core` | Phase 3 orchestrator, operating system and runtime wiring | Phase 3 approved |
| `boris` | `agents/BORIS-001`, `boris/`, hosted roster profile and existing tests | Existing runtime mapped; identity certification claims unchanged |
| `gary` | `agents/GARY-001`, deterministic Inspector, hosted roster profile and Growth pack | Existing runtime mapped; identity/history preserved |
| `design-director` | Invocation/authority contracts, Design pack, registered design-tool ownership and callable adapter | Operational bootstrap; Cristian approval pending |
| `quality-gate` | Existing tests, CI, advisory/GStack review references and callable exact-candidate adapter | Operational bootstrap; self-certification forbidden; Cristian approval pending |

## Legacy consolidation

The machine-readable mapping is `factory/registry/legacy-role-mapping.json`.

- **KEEP / compatibility:** `BORIS-001` → BORIS; `GARY-001` → Gary.
- **MERGE / absorbed capability:** Gary Tan and Gary Vee → Gary; Premium Experience Director → Design Director; Testing Agent → Quality Gate; Vibe Coder, Algorithm Agent and Systems Agent → BORIS.
- **DEPRECATE without deletion:** Marketing Chief and Growth Council → Gary; PED → Design Director; Reviewer → Quality Gate; Influencers Council and Engineering Council → BORIS.

Deprecated names resolve to their permanent owner. Historical code, packages, council records and documentation remain in place and do not become sixth permanent roles.

## Bootstrap boundary

Callable does not mean independently certified. Design Director and Quality Gate are available to receive bounded work, but their initial creation cannot satisfy its own approval. Quality Gate requires an exact candidate and retained evidence; when evaluating its own bootstrap, it always returns uncertified with Cristian approval required. The Phase 3 orchestrator carries pending bootstrap certification as a certification/release blocker, not a general isolated-build blocker.

## Deferred

Phase 5 owns the complete Quality & Safety evidence packet and dedicated browser, visual, accessibility, security, performance and adversarial gates. Phase 6 Shelf admission and Michel OS are untouched.
