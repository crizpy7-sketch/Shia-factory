# Shia Factory Core v2 Status

Evidence rule: an item is complete only when the linked repository evidence exists and verification passes.

## Phase 1 — Foundation & Audit

- [x] Core v2 governing brief recorded as the migration authority — `factory/registry/core-v2.json`
- [x] Existing `main` state preserved at `62bec616436acbb301ce7d7768749a2df255be3a`
- [x] Isolated migration branch created — `migration/core-v2-foundation`
- [x] Current-state inventory and classification completed — `docs/audits/CORE_V2_CURRENT_STATE_AUDIT.md`
- [x] Initial Factory `APP_PROFILE.yaml` added
- [x] Canonical Core v2 folder structure implemented non-destructively — `tests/core-v2-structure.test.mjs`
- [x] Canonical Core v2 architecture published — `docs/CORE_V2_ARCHITECTURE.md`
- [x] Phase 1 completion reviewed and approved by Cristian — merged PR #10, `fe58443408563a5c086fa7971859e6c9d8256adc`
- **Phase 1: 100% complete** — all four source-tracker items have merged repository evidence

## Phase 2 — Permanent Registry

- [x] Canonical five-role registry added with honest implementation states
- [x] Canonical seven-pack registry added with honest implementation states
- [x] Initial plugin/tool ownership map added
- [x] Registry shape protected by automated tests
- [x] Role invocation contracts normalized — `factory/registry/invocation-contracts.json`
- [x] Seven pack indexes created by mapping existing skills without duplication — `skills/registry.json`, `skills/*/PACK.json`
- [x] Permanent-role authority and permission boundaries explicit — `factory/registry/authority-matrix.json`
- [x] Legacy runtime, identity and skill paths preserved by compatibility tests — `tests/core-v2-permanent-registry.test.mjs`
- [x] Phase 2 completion reviewed and approved by Cristian — merged PR #11, `0e357117c875d4432c826c07aea175dee64a01be`
- **Phase 2: 100% complete** — all four source-tracker items have merged repository evidence

## Phase 3 — Orchestrator Core

- [x] Parse and validate `APP_PROFILE.yaml` — `boris/src/factory/orchestrator-core.ts`, `boris/tests/unit/orchestrator-core.test.ts`
- [x] Search existing Factory assets before capability creation — deterministic discovery only; no Phase 6 admission
- [x] Route minimum roles, packs and tools from risk/profile/registries with unavailable roles preserved
- [x] Persist repository-bound orchestration decisions and evidence receipts
- [x] Phase 3 completion reviewed and approved by Cristian — merged PR #12, `cf13c909a3d06d8563e0ea5fd2f3418c1bcc8c19`
- **Phase 3: 100% complete** — all four source-tracker items have merged repository evidence

## Phase 4 — Agent Consolidation

- [x] Map existing BORIS implementation to the permanent BORIS contract — `boris/src/identity/permanent-workforce.ts`
- [x] Map existing Gary implementation to the permanent Gary contract — existing identity/runtime preserved
- [x] Implement Shia Core using the single Phase 3 orchestration engine
- [x] Implement callable Design Director bootstrap using indexed design contracts/capabilities — Phase 4 bootstrap approved; full certification remains deferred
- [x] Implement callable Quality Gate bootstrap using existing tests/review evidence — self-certification forbidden; Phase 5 deferred
- [x] Deprecate superseded councils/aliases without deleting history — `factory/registry/legacy-role-mapping.json`
- [x] Phase 4 completion reviewed and approved by Cristian — merged PR #13, `d2f87e3a3a2b66394e3ff290ad5dda35b95483aa`
- **Phase 4: 100% complete** — all six source-tracker items have merged repository evidence

## Phase 5 — Quality & Safety

- [x] Unified exact-candidate Quality Gate evidence packet — `boris/src/quality/quality-gate.ts`, `factory/quality/quality-gate-receipt.schema.json`
- [x] Browser and visual evidence contract — requires real-browser metadata and retained artifact digests; unavailable evidence returns `needs-evidence`
- [x] Accessibility gate — deterministic/observed evidence required; source inspection alone cannot pass
- [x] Security and adversarial gate by risk — `factory/quality/risk-gate-policy.json`
- [x] Performance gate by relevant surface/risk — explicit thresholds and measurements required
- [x] Dangerous-action permission verification — `boris/tests/security/quality-gate-authority.test.ts`
- [x] Bounded BORIS repair and exact-candidate retest loop — stale evidence cannot certify a repaired SHA
- [ ] Phase 5 completion reviewed and approved by Cristian — draft PR pending
- **Phase 5 candidate: 7/7 technical items evidenced; approval pending.** Phase 5 is not yet an approved completion.

## Phase 6 — Reusable Factory Shelf

- [ ] Shelf manifest and admission standard
- [ ] Inventory existing blocks
- [ ] Define modules
- [ ] Define blueprints
- [ ] Reuse search and extraction workflow

## Phase 7 — Pilot Migration: Michel OS

- [ ] Inspect and profile Michel OS
- [ ] Run lifecycle through deploy/observe
- [ ] Record Quality Gate evidence
- [ ] Extract reusable improvements

## Phase 8 — Factory Proven

- [ ] GBrain learning round-trip verified
- [ ] Core v2 versioned and documented
- [ ] Michel OS pilot accepted
- [ ] Definition of Done fully evidenced

## Deferred cross-phase improvement

- [ ] Make `docs/STATUS.md` the canonical progress source and have the Factory dashboard derive percentages from it; retire browser-local checkbox state only after compatibility and migration tests pass
