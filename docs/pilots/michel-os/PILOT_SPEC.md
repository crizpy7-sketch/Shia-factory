# Michel OS bounded Phase 7 pilot specification

## Selected improvement

Add exact deployed-release provenance to the existing Michel OS readiness surface and deployment workflow.

This is a real operational defect: repository evidence defines `.swarm/deployed-sha` as the deployed revision, but `/api/ready` currently returns only `{"ready":true}`. Without trusted VPS access, the Factory cannot remotely bind observed production health to a Git candidate. The pilot closes that observability gap without rebuilding Michel OS or changing household features.

No implementation is included in this inspection PR.

## Why this pilot

- It exercises existing-app understanding, BORIS engineering, Quality Gate exact-candidate receipts, the VPS production adapter, deployment, observation and reusable extraction.
- It does not require a database migration or destructive data operation.
- It is not user-interface work, so Design Director is not required for this bounded candidate. Any later UI exposure would require Design Director plus browser, visual and accessibility evidence.
- It creates a genuine candidate for extraction into the existing Operations/Quality packs or deployment adapter after lifecycle proof; it does not create a standalone skill.

## Acceptance criteria

1. A future isolated candidate exposes an immutable, validated 40-hex Git release SHA in the existing readiness response.
2. The readiness response exposes no secret values, host identity, database URL, token or unrestricted environment metadata.
3. `/api/ready` retains its current database connectivity check and returns 503 when PostgreSQL is unavailable.
4. Docker/Compose and the approved deployment path inject the exact candidate SHA deterministically; arbitrary caller-provided request data cannot set it.
5. The live readiness SHA, `.swarm/deployed-sha`, approved candidate and Quality Gate receipt SHA must all match before the deployment can be declared observed.
6. Unit, integration, security and runtime tests bind to the exact candidate. Evidence for an older SHA cannot certify a repaired candidate.
7. No SQL migration or production data mutation is introduced.
8. Merge and deployment require verified Phase 5 Quality Gate evidence and Cristian approval. Passing tests grant no deployment authority.
9. A rollback to the captured pre-deploy revision restores readiness and application access if the new candidate fails.

## Risk and routing

The evidence-derived APP_PROFILE baseline is **T3** because Michel OS is an authenticated production app containing private household and small-business data. Small diff size does not reduce that consequence.

Minimum permanent roles:

- Shia Core: profile validation, Shelf-first discovery, risk/tool routing and receipts.
- BORIS: isolated implementation and deployment preparation.
- Quality Gate: independently evaluate exact-candidate unit/integration/security/runtime evidence.

Design Director is conditional and not selected for this non-UI pilot. Gary is not required. Cristian remains the human merge/deploy approval gate.

The current task contract permits isolated implementation and verification but marks production
deployment `precondition-blocked`. A gated authority string is not deployment eligibility. Eligibility
requires all seven trusted production preconditions in `orchestration-contract.json` to be satisfied
against the same task, repository and exact candidate.

## Migration preservation rule

Phase 6 Shelf disposition and Michel OS application action are separate decisions:

- Existing working authentication, PostgreSQL persistence, scheduling, notifications/search, AI
  integration and business workflows are `PRESERVE` even though the Shelf has no matching admitted
  asset and reports `CREATE`.
- The missing release-provenance/readiness capability is `IMPLEMENT`.
- Potential Factory extraction is `CANDIDATE_AFTER_LIFECYCLE_PROOF`; it is not automatically admitted.

No Shelf no-match result authorizes rebuilding Michel OS.

## Backup and rollback prerequisite

Before any future deployment:

1. Read the current live `.swarm/deployed-sha`; stop if it cannot be resolved to a repository commit.
2. Record the live Compose project, compose file, containers, image IDs, loopback port, proxy upstream and readiness result without recording secrets.
3. Run the repository backup procedure and verify the compressed dump is non-trivial; record digest, timestamp and retention location.
4. Copy the backup off the VPS or take a provider snapshot. A same-server dump alone is not disaster recovery.
5. Prefer a disposable restore verification before deployment; do not restore over production.
6. Preserve the previous source checkout/image and exact Compose configuration.
7. Deploy only the Cristian-approved exact candidate after admitted Quality Gate evidence.
8. On failed readiness, stop the candidate, restore the previous revision/configuration and verify `/api/ready`. Because the proposed pilot has no schema migration, database rollback should not be required.

The unresolved current production revision and unverified backup inventory are hard pre-deployment evidence gaps.

## Expected reusable extraction

After the pilot is deployed and observed—not before—evaluate extraction of a provider-neutral release-provenance/readiness contract and a VPS observation adapter into the existing Operations and Quality packs. The extracted candidate must pass normal Shelf admission; lifecycle success does not automatically admit it.
