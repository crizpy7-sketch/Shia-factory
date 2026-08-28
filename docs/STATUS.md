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

- [ ] Parse and validate `APP_PROFILE.yaml`
- [ ] Search Shelf before capability creation
- [ ] Route minimum roles/tools from risk and profile
- [ ] Persist orchestration decisions and evidence receipts

## Phase 4 — Agent Consolidation

- [ ] Map existing BORIS implementation to the permanent BORIS contract
- [ ] Map existing Gary implementation to the permanent Gary contract
- [ ] Implement Shia Core using existing orchestration logic
- [ ] Implement Design Director using existing design capabilities
- [ ] Implement Quality Gate using existing tests/review capabilities
- [ ] Deprecate superseded councils/aliases without deleting history

## Phase 5 — Quality & Safety

- [ ] Unified Quality Gate evidence packet
- [ ] Browser and visual evidence capture
- [ ] Accessibility gate
- [ ] Security and adversarial gate by risk
- [ ] Performance gate by risk
- [ ] Dangerous-action permission tests

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
