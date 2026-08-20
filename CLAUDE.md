# Shia Factory AI Operating Contract

Shia Factory is the orchestration and product layer. GStack is the default software-engineering execution methodology. GBrain is the default persistent memory substrate.

## Source of truth

- Preserve Shia-owned agent identity, authority, avatars, evaluation records, blocks, and Factory UI in this repository.
- Do not vendor or copy GStack skill implementations into this repository. Use the upstream installation so fixes and new skills continue to flow from `garrytan/gstack`.
- Do not reimplement GBrain retrieval, memory verbs, knowledge-graph storage, or cross-session memory unless a Shia-specific requirement cannot be met by the upstream protocol.
- Named Shia agents such as Boris remain advisory unless their package explicitly grants execution authority. Advisory agents may challenge, score, request rework, or recommend a route; they do not silently build, merge, deploy, or access secrets.

## Default build loop

For non-trivial product or engineering work, prefer this sequence:

1. `/office-hours` — establish the real user problem and narrowest valuable wedge.
2. `/spec` — convert intent into an executable specification with acceptance criteria.
3. `/autoplan` — run CEO, design, engineering, and developer-experience reviews.
4. Implement the approved plan.
5. `/review` — staff-engineer review and completeness check.
6. `/codex` — independent cross-model adversarial review when Codex is available.
7. `/qa` — exercise the real product and add regression coverage for discovered defects.
8. `/cso` — security review for externally reachable, authenticated, payment, data, or privileged surfaces.
9. `/ship` — release/PR gate.
10. `/land-and-deploy` — only when authorized to merge/deploy; verify production after deployment.
11. `/learn` — capture durable project-specific lessons.

Small, obvious changes do not need the full loop. Use the smallest subset that preserves correctness.

## Skill routing

When GStack is installed, route work to its skills instead of inventing an ad-hoc process:

- Product framing / idea quality → `/office-hours`
- Backlog-ready requirement → `/spec`
- Strategy / scope / ambition → `/plan-ceo-review`
- Architecture / data flow / failure modes → `/plan-eng-review`
- Full plan gauntlet → `/autoplan`
- UX / visual plan → `/plan-design-review`, `/design-consultation`
- Live visual quality → `/design-review`
- Bugs / unexplained behavior → `/investigate`
- Code review → `/review`
- Real product testing → `/qa` or `/qa-only`
- Security → `/cso`
- Performance → `/benchmark`
- Cross-model challenge → `/codex`
- Release → `/ship`
- Deploy verification → `/land-and-deploy`, then `/canary` when appropriate
- Save/resume execution state → `/context-save`, `/context-restore`
- Durable learning → `/learn`
- Brain onboarding / refresh → `/setup-gbrain`, `/sync-gbrain`

## GBrain memory protocol

All Shia agents that support persistent memory should use the GBrain MEMORY_VERBS v1 surface when possible:

- `recall`
- `remember`
- `entity`
- `synthesize`
- `forget`
- `context_pack`
- `delta`

Rules:

1. Add provenance to every durable memory write.
2. Attach entity/project identifiers whenever a memory is about a specific project, agent, person, or company.
3. Prefer `recall`/`entity` for cheap lookups; use `synthesize` only when evidence must be combined across sources.
4. Never persist secrets, credentials, raw tokens, or private data unless the user has explicitly selected an appropriate private brain/visibility boundary.
5. Project decisions, plans, failures, learnings, and accepted architecture should be recoverable across sessions.

## Shia memory namespaces

Recommended GBrain sources for the broader system:

- `shia-factory`
- `remixr`
- `shia-baby`
- `gary`
- `boris`
- `rumor-runner`
- `games-vr`
- `marketing`
- `second-brain`
- `research`

This repository should resolve to the `shia-factory` source when the local GBrain installation is configured.

## Completeness standard

Search before building. Prefer permanent fixes to workarounds. Finish the requested scope when the marginal cost is low. Add tests for behavior that can regress. Update living documentation when architecture or operating contracts change. Verify the real workflow before calling work complete.

## Bootstrap

If GStack/GBrain are not available on the current machine, use one of:

- `scripts/bootstrap-ai-stack.sh`
- `scripts/bootstrap-ai-stack.ps1`

Then verify the installation as described in `docs/AI_STACK.md`.
