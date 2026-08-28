# Shia Factory Core v2 Current-State Audit

Audit date: 2026-08-28  
Audited baseline: `main@62bec616436acbb301ce7d7768749a2df255be3a`  
Migration branch: `migration/core-v2-foundation`

## Executive finding

The repository already contains a serious control-plane foundation: consequence-based risk tiers, task contracts, exact-candidate receipts, bounded repair, coded permissions, BORIS runtime machinery, deterministic tests, GStack/GBrain boundary contracts, two real blocks, and an HQ/workbench. It is not yet Core v2. Its operational center is BORIS plus Gary, its skill taxonomy has two Factory procedures rather than seven packs, reuse is a small block workbench rather than a governed Shelf, and there is no `APP_PROFILE`-driven role/tool selection or unified Quality Gate.

## Current-state inventory

| Area | Current evidence | State |
| --- | --- | --- |
| Agents | BORIS-001 and GARY-001 packages; registry, routing, HQ and agent tests | Two named agents; neither certified; no Shia Core, Design Director or unified Quality Gate |
| Skills | `factory-runtime-wiring`, `factory-learning-loop`, Gary host `growth-operator` | Valuable but not organized into seven packs |
| Orchestration | Operating-system and runtime-wiring TypeScript; risk, readiness, evidence, receipts and repair | Strong primitives; no APP_PROFILE parser, reuse-first lookup or minimum-role selector |
| Reuse | `forms-001`, `records-002`, static workbench | Two blocks only; no modules, blueprints, manifests or admission gate |
| Quality | 96 agent-layer tests at last recorded commit; BORIS unit/integration/security/E2E suites and CI | Broad engineering coverage; no unified independent evidence packet, visual/accessibility/performance gate |
| Documentation | Constitution, operating system, build/VPS standards, AI stack, templates | Strong policy docs; canonical per-app document set and Core v2 tracker incomplete |
| GStack | Upstream extension contract and workflow mapping | Contract documented; executable compatibility verification not automated |
| GBrain | source pin, memory seed and PowerShell seed script | Durable boundary documented; round-trip evidence not stored in repository |
| Permissions/security | coded capability routing, path/tool task contracts, security tests, restricted HTTP allowlist | Strong base; ownership map and dangerous-action gate coverage need consolidation |
| Dashboard | static HQ/workbench | Useful prototype; not an evidence-driven Core v2 progress/Shelf dashboard |

## KEEP / MERGE / UPGRADE / RETIRE matrix

| Classification | Asset/concept | Decision |
| --- | --- | --- |
| KEEP | `FACTORY_CONSTITUTION.md` | Preserve as governance authority; change only through elevated review |
| KEEP | `docs/factory/OPERATING_SYSTEM.md` | Preserve risk, contracts, context, evidence, receipts and learning foundations |
| KEEP | BORIS runtime and test suites | Reuse as the engineering/runtime substrate |
| KEEP | GStack/GBrain contracts and source pin | Preserve the explicit authority boundaries |
| KEEP | coded routing and permission checks | Extend; do not replace with prompt-only controls |
| KEEP | forms and records blocks | Admit later only after Shelf manifest/quality review |
| MERGE | BORIS-001 plus `boris/` runtime engineering responsibilities | Normalize under permanent BORIS while preserving portable identity provenance |
| MERGE | Gary identity, growth operator skill and product/growth behavior | Normalize under permanent Gary and Product/Growth packs |
| MERGE | agent advisory, BORIS tests and CI quality concepts | Consolidate behind independent Quality Gate evidence contracts |
| MERGE | runtime-wiring and learning-loop skills | Place procedures into Operations/Engineering/Quality packs without copying upstream GStack skills |
| UPGRADE | agent registry | Move from two-person roster to canonical five-role registry with ownership and status |
| UPGRADE | skill organization | Seven stable packs with indexes, provenance and admission rules |
| UPGRADE | workbench | Governed Shelf of blocks → modules → blueprints → apps |
| UPGRADE | orchestration | Parse APP_PROFILE, search reuse first, classify risk, select minimum roles/tools |
| UPGRADE | HQ | Evidence-based tracker, Shelf browser and lifecycle view |
| UPGRADE | per-app templates | Add all nine canonical project files and profile schema |
| RETIRE / DEPRECATE | Council-first hierarchy as the main routing model | Preserve history; replace operational routing with five permanent roles selected by need/risk |
| RETIRE / DEPRECATE | New standalone skill/agent per app | Enforce reuse/new-capability admission rule |
| RETIRE / DEPRECATE | Static version labels that imply operational completeness | Derive status from evidence and registries |
| RETIRE / DEPRECATE | Unverified completion/certification language | Continue current honest-state policy; only evidence may advance status |

## Gaps against Core v2

1. Three permanent roles are absent as operational contracts; BORIS and Gary require normalization.
2. Seven pack indexes, ownership, promotion and deprecation rules are absent.
3. `APP_PROFILE` was absent and does not yet drive code.
4. No Shelf registry, manifest schema, admission standard or reuse-search function exists.
5. Risk does not yet select swarm/role size automatically.
6. Quality results are fragmented; no independent exact-candidate Quality Gate receipt exists.
7. Visual QA, accessibility and performance evidence are not first-class gates.
8. Plugin/tool ownership was implicit.
9. The full canonical per-app document set is not templated.
10. Modules and blueprints do not exist.
11. GBrain round-trip and GStack compatibility checks lack current stored evidence.
12. Michel OS has not run the complete lifecycle or returned reusable improvements.

## Proposed target structure

```text
shia-factory/
├── factory/{orchestrator,registry,policies,quality,memory}
├── agents/{shia-core,boris,design-director,gary,quality-gate}
├── skills/{product,design,engineering,ai,quality,growth,operations}
├── blocks/
├── modules/
├── blueprints/
├── adapters/
├── dashboard/
├── docs/{audits,decisions,factory}
├── templates/app-repo/
└── tests/
```

Legacy paths remain readable until their replacement is verified. Moves happen separately from semantic changes and use deprecation maps.

## Safe migration sequence

1. Preserve baseline SHA and use an isolated branch.
2. Add evidence-based tracker, APP_PROFILE and canonical registry without moving legacy files.
3. Add schemas/tests for registry, profile and Shelf manifests.
4. Implement reuse search and role/tool selection alongside existing runtime.
5. Create pack indexes that reference/merge current procedures; do not duplicate upstream GStack.
6. Build unified Quality Gate receipt from existing suites, then add missing visual/a11y/performance checks.
7. Admit existing blocks through the Shelf standard; then form modules and blueprints.
8. Normalize legacy agent paths with compatibility adapters and explicit deprecation notices.
9. Pilot Michel OS end to end on its own branch/workspace.
10. Extract verified pilot improvements, verify GBrain round-trip, version Core v2, then request human merge/deploy approval.

## First implementation batch

This migration branch adds only reversible foundation artifacts:

- Factory `APP_PROFILE.yaml`;
- canonical five-role/seven-pack/tool-ownership registry with honest status;
- automated registry invariants;
- evidence-based Core v2 tracker;
- this audit and migration map.

It creates no new permanent agent package, moves no legacy path, changes no runtime authority, and performs no deployment.
