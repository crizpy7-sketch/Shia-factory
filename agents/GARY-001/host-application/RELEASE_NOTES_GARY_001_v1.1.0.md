# Gary Vee Growth Agent v1.1.0 — GARY-001 Identity Integration

## What changed

GARY-001 identity architecture v0.4 is integrated into the executable growth agent.

- Added the full portable identity package under `agent/gary-001/`.
- Added `src/agent/identity-context.ts` to load stable identity, cognitive model, and research status at runtime.
- Updated the strategist from `Gary Vee Growth Strategist` to `GARY-001 Growth Strategist`.
- Strategist prompt order is now: durable identity -> Growth Operator skill -> narrow campaign execution contract.
- Kept the independent release critic personality-neutral for adversarial review.
- Added `npm run identity:verify` to validate identity IDs, versions, owner authority, non-impersonation notice, and deployment wiring.
- Production standalone builds and both Docker targets now ship `agent/gary-001/`.
- Updated architecture/runtime documentation.

## Important boundaries preserved

- GARY-001 is a Shia-owned fictionalized growth-agent identity informed only by source-reconciled public principles; it is not Gary Vaynerchuk and must not imply affiliation or endorsement.
- Cristian remains final authority for external publishing and commitments.
- The AI strategist still receives no provider tools and cannot bypass the approval digest.
- Historical/public-figure research cannot override current product evidence, real campaign results, customer economics, or current platform rules.
- A new underlying model does not automatically inherit GARY-001 certification.

## Validation performed in this integration environment

Passed:

- identity/runtime wiring verifier;
- identity/passport/migration version consistency;
- JSON parsing for package metadata;
- Node syntax checks for modified `.mjs` runtime scripts;
- ZIP integrity check after packaging.

Not run here:

- full `npm run test:all`, because this environment could not fetch one locked npm dependency and the source ZIP does not include `node_modules`.

The original package already contains its test/build suite. On a machine or VPS with npm registry access, run `npm ci && npm run test:all` before production rollout.
