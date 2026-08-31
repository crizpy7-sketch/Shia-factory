# Shia Factory Core v2 Status

Evidence rule: an item is complete only when the linked repository evidence exists and verification passes.

Canonical progress rule: this file is the authoritative Core v2 scoreboard. The denominator remains
41 official tasks. Phase 6 has five official technical tracker items; its factual trust-manifest is
a required sub-component of the Shelf admission/trust standard, not a sixth top-level task. The
manual HTML tracker must not override this repository state.

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

- [x] Unified exact-candidate Quality Gate evidence packet — admitted evidence only; raw claims retained for audit (`boris/src/quality/evidence-admission.ts`)
- [x] Browser and visual evidence contract — requires a verified runner record plus retained bytes with computed matching SHA-256; caller metadata/digests cannot pass
- [x] Accessibility gate — deterministic/observed evidence required; source inspection alone cannot pass
- [x] Security and adversarial gate by risk — `factory/quality/risk-gate-policy.json`
- [x] Performance gate by relevant surface/risk — explicit thresholds and measurements required
- [x] Dangerous-action permission verification — verified existing Factory approval receipt required
- [x] Bounded BORIS repair and exact-candidate retest loop — stale evidence cannot certify a repaired SHA
- [x] Phase 5 completion reviewed and approved by Cristian — merged PR #14, `d2b1baa2005c10ac1b2c25a26a8c705acc6c444e`
- **Phase 5: 100% complete** — all seven technical items have merged repository evidence and Cristian approved the exact trusted-evidence candidate

Production CI, BORIS, browser and GStack evidence adapters still require real environment-specific wiring and must be proven during an application lifecycle. Phase 5 approval does not claim those future application integrations already work.

## Phase 6 — Reusable Factory Shelf

- [x] Shelf manifest, lifecycle, trusted Phase 5 admission and factual trust-manifest standard — exact-source Git-tree proof is bound to an independently configured repository identity and admitted dependency chain; `factory/shelf/shelf-asset.schema.json`, `factory/shelf/trust-manifest.schema.json`, `factory/shelf/admission-policy.json`, `boris/src/factory/reusable-shelf.ts`
- [x] Existing reusable-surface inventory completed without false certification — `factory/shelf/inventory.json`; Forms and Records are candidates, not admitted
- [x] Block/Module/Blueprint dependency and cycle rules implemented — no Module was manufactured from BORIS-coupled scheduling surfaces
- [x] Blueprint contract defined — no Blueprint was created because no evidence-backed reusable application architecture exists yet
- [x] Shelf-first `REUSE / EXTEND / CREATE` workflow integrated with the single Phase 3 orchestrator and decision receipt — exact `REUSE` requires canonical capability IDs/explicit aliases; fuzzy similarity is `EXTEND`/discovery only
- [x] Phase 6 completion reviewed and approved by Cristian for exact candidate `3d142d37c37886a8df9e7fd37e5a340cc9f31f70` — merged PR #15, `ae40e2274004af88d980aa748023c390dc145a81`
- **Phase 6: 100% complete** — 5/5 official technical tracker items have merged repository evidence and Cristian approved the exact candidate

Approved Core v2 progress is **30/41 = 73.17%** through merged Phase 6.

The original component-family tracker is not treated as proof that missing Blocks exist. Current
coverage is: Forms and Records have candidate manifests; general application identity/auth,
files/media, scheduling/notifications/realtime, AI Gateway/analytics/audit/background jobs and
Stripe/payments remain confirmed gaps or extraction candidates. No Shelf asset was automatically admitted by Phase 6. Forms and Records remain candidates;
cross-repository fetching/cloning remains deferred; and production application adapters still
require lifecycle proof.

## Phase 7 — Pilot Migration: Michel OS

- [ ] Inspect and profile Michel OS
- [ ] Run lifecycle through deploy/observe
- [ ] Record Quality Gate evidence
- [ ] Extract reusable improvements

Phase 7 baseline-checkpoint evidence is merged in `docs/pilots/michel-os/`. Cristian approved the
exact candidate `9361f1e3bff47f15780070a93ce8b0d31a33bec4`; PR #16 was merged at
`6fa7a19e76c8227a5e0e3ae66e24cf914956e8ba`. This approval records the read-only baseline
checkpoint only: it does not complete Phase 7 or satisfy any of the four tracker items above.

The Michel OS repository at
`50403bcd52425d3f49788905ebd81962647e2d39` is profiled and its local gauntlet passes, but the first
tracker item remains incomplete because the live VPS, deployed SHA, health, backup inventory and
environment-specific integrations could not be independently observed. No production mutation has
occurred. The merged baseline contract keeps isolated build/test routable while production deploy is
precondition-blocked, and migration actions preserve working Michel OS capabilities independently
of Shelf no-match results. Approved progress remains **30/41 = 73.17%**.

## Phase 8 — Factory Proven

- [ ] GBrain learning round-trip verified
- [ ] Core v2 versioned and documented
- [ ] Michel OS pilot accepted
- [ ] Definition of Done fully evidenced

## Deferred cross-phase improvement

- [ ] Make `docs/STATUS.md` the canonical progress source and have the Factory dashboard derive percentages from it; retire browser-local checkbox state only after compatibility and migration tests pass
