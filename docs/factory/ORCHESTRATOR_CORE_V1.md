# Orchestrator Core v1

Phase 3 adds a deterministic-first Shia Core pipeline at
`boris/src/factory/orchestrator-core.ts`.

## Pipeline

1. strictly parse and validate `APP_PROFILE.yaml`;
2. scan existing blocks, modules, blueprints, registered pack members and known implementations;
3. classify reuse provenance as `verified`, `unverified`, `legacy` or `candidate`, separately from certification;
4. classify T0–T4 risk from profile baseline, data sensitivity, consequence and requested authority;
5. select the minimum permanent roles, packs and owned tools from the Phase 2 registries;
6. enforce the authority matrix and preserve unavailable roles as execution or certification/release blockers;
7. emit a machine-readable task contract;
8. create and optionally persist a deterministic receipt bound to project, task, profile, contract,
   branch and commit SHA.

## Fail-closed boundaries

- unsupported YAML/schema/profile fields are rejected;
- unknown roles, actions, tools or registry mismatches are rejected;
- reuse search cannot be disabled;
- acceptance criteria and repository SHA are mandatory;
- denied actions block the contract;
- a requested action owned by an unavailable role is an execution blocker;
- BORIS may build an isolated candidate for a missing role, but the missing role remains unavailable and its approval remains unsatisfied;
- unavailable selected roles block certification, completion and release; merge/deploy cannot execute while those blockers remain;
- the compatibility fields `blocked` and `blockers` continue to mean hard execution blocking;
- at the Phase 3 merge point, missing Design Director and unified Quality Gate capabilities remained honestly unavailable; later role phases must update the registry rather than invent execution history;
- an existing provenance-verified capability routes to reuse before new creation;
- a receipt file cannot be overwritten with different content.

## Reuse verification is not certification

The legacy reuse state `verified` means only that existing provenance was found, such as a local manifest or registered local `SKILL.md`. Every reuse finding also carries explicit certification fields. In Phase 3, `shelfAdmission` and `qualityCertification` are always `not-evaluated`. A manifest, path or skill registration never implies production readiness, Quality Gate certification or Phase 6 Shelf admission.

## Intentionally not implemented

- Phase 3 itself creates no role implementation or agent identity;
- no Shelf admission or asset certification is performed;
- the Phase 5 Quality Gate candidate consumes Phase 3 task contracts but cannot alter their risk, authority, approval or repair-budget decisions;
- no agent consolidation is performed;
- no app, including Michel OS, is migrated;
- no automatic merge, deployment or external side effect occurs;
- the YAML parser supports the canonical APP_PROFILE subset, not arbitrary YAML features.
