# Orchestrator Core v1

Phase 3 adds a deterministic-first Shia Core pipeline at
`boris/src/factory/orchestrator-core.ts`.

## Pipeline

1. strictly parse and validate `APP_PROFILE.yaml`;
2. scan existing blocks, modules, blueprints, registered pack members and known implementations;
3. classify reuse findings as `verified`, `unverified`, `legacy` or `candidate`;
4. classify T0–T4 risk from profile baseline, data sensitivity, consequence and requested authority;
5. select the minimum permanent roles, packs and owned tools from the Phase 2 registries;
6. enforce the authority matrix and preserve unavailable roles as blockers;
7. emit a machine-readable task contract;
8. create and optionally persist a deterministic receipt bound to project, task, profile, contract,
   branch and commit SHA.

## Fail-closed boundaries

- unsupported YAML/schema/profile fields are rejected;
- unknown roles, actions, tools or registry mismatches are rejected;
- reuse search cannot be disabled;
- acceptance criteria and repository SHA are mandatory;
- denied actions block the contract;
- missing Design Director and unified Quality Gate capabilities remain unavailable;
- an existing verified capability routes to reuse before new creation;
- a receipt file cannot be overwritten with different content.

## Intentionally not implemented

- no role implementation or agent identity is created;
- no Shelf admission or asset certification is performed;
- no Quality Gate runtime is implemented;
- no agent consolidation is performed;
- no app, including Michel OS, is migrated;
- no automatic merge, deployment or external side effect occurs;
- the YAML parser supports the canonical APP_PROFILE subset, not arbitrary YAML features.
