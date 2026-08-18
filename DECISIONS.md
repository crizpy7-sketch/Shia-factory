# Decisions — Shia App Factory

Architectural decisions that would otherwise be re-litigated. Per the master blueprint §143, each
records what was decided, why, what else was considered, and when to revisit.

---

## D-001 — Boris builds under a Factory grant, not a rewritten identity

**Date** 2026-08-18 · **Decided by** Cristian (requested), implemented in `agents/registry.js`

**Decision.** Boris gained `may_author_code`, `may_build`, `may_scaffold_blocks` and `may_run_tests`
through grant `BORIS-BUILD-001`, recorded in the registry with grantor, date, scope, reason and a
`withheld` list. His package `authority` block is untouched.

**Why.** The obvious implementation was to add the capabilities to `authority` in `registry.js` and
to `agents/BORIS-001/identity/identity.json`. That fails three ways:

1. `registry.test.mjs` asserts `boris.authority` deep-equals `identity.authority` — a drift guard
   that exists precisely to stop the host rewriting a transferred identity.
2. The package is SHA256-manifest-verified. Editing it means regenerating the manifest, which
   silently converts a transfer attestation into a local assertion.
3. It loses the distinction that matters: what the Influencers Council transferred versus what
   Cristian granted here. A year from now, "why can Boris write code?" should have an auditable
   answer with a name and a date on it.

**Alternatives considered.** Editing the package identity (rejected, above). A separate ACL file
outside the registry (rejected — splits the source of truth). Letting the agent module decide its
own capabilities (rejected — the whole point is that the router refuses before dispatch).

**Consequences.** Grants can only add. `capabilities()` refuses to flip anything the package or the
grant's own `withheld` list closes, and there is a test for a rogue grant that tries. Grant-provided
aliases live on the grant, so revoking it removes `"Boris build this"` too.

**Revisit when** an agent needs a capability *removed* rather than added — the current model has no
revocation record, only absence.

---

## D-002 — Router enforcement is deny-unless-held

**Date** 2026-08-18 · **Implemented in** `agents/routing.js`

**Decision.** A restricted request passes only when the agent's effective capability is exactly
`true`. A capability the agent never declares is treated as withheld.

**Why.** The previous rule was `authority[capability] === false` — it refused only what an agent
explicitly denied itself. That worked with one agent whose package listed every boundary. With two
agents it silently opened up: Gary's package never mentions `may_merge`, so under the old rule
"merge this" would have been permitted for him. Least privilege has to be the default, not the
result of every package remembering to say no to everything.

**Consequences.** A newly registered agent can do nothing restricted until granted. Adding a
`RESTRICTED` rule tightens every agent at once, which is the right direction for a rule to travel.
Different packages name the same boundary differently (`may_access_secrets` vs
`may_access_secrets_directly`), so rules carry a list of keys and the denial cites whichever key the
agent itself declares.

**Revisit when** the ecosystem adopts the blueprint's `deploy:production`-style permission scopes
(§23). The grant layer is where the two vocabularies should be mapped — the agent packages keep
their `may_*` contracts, and grants translate ecosystem scopes onto them.

---

## D-003 — Gary is registered with a placeholder avatar, labelled as one

**Date** 2026-08-18 · **Implemented in** `assets/agents/gary-001/`, `agents/registry.js`

**Decision.** The GARY-001 package shipped no avatar art. Rather than generate art and present it as
his, the Factory uses a generated monogram that says `PLACEHOLDER` in the artwork itself, marked
`avatar_provenance: 'placeholder'` in the registry and disclosed in the Office and the Inspector.

**Why.** Boris's avatars are byte-verified against his package. If Gary's were merely *present*, the
two would look like the same kind of claim in the same UI slot. The registry distinguishes
`package` from `placeholder` provenance so the interface can be honest about which is which.

**Revisit when** real GARY-001 identity art exists — replace the files, set `avatar_provenance` to
`package`, add the avatar to his `agent-card.json`, and the test that asserts the card nominates no
avatar will fail on purpose to remind you.

---

## D-004 — Gary's package integrity is a baseline, not a transfer manifest

**Date** 2026-08-18 · **Implemented in** `agents/GARY-001/SHA256_MANIFEST.json`

**Decision.** Gary arrived without a manifest, so one was generated at integration time and the
registry records `package_integrity: 'integration_baseline'` — against Boris's
`'transfer_manifest'`.

**Why.** Both files look identical and both detect drift from here on. Only one of them attests that
what arrived is what was sent. Labelling them the same would overstate what is known about Gary's
package.

**Revisit when** an original GARY-001 manifest is recovered; reconcile by provenance rather than
overwriting.

---

## D-005 — Boris refuses to build over a high-severity defect

**Date** 2026-08-18 · **Implemented in** `agents/build.js`

**Decision.** The build pass runs the advisory pass first and returns `blocked` — with the blockers
and no artifacts — when the graph has high-severity structural findings. `force` overrides, and the
resulting export and its summary both say it was forced.

**Why.** An export that quietly encodes a known-broken graph is worse than no export: it looks like
progress and it fails later, somewhere else. Wiring the two passes together also means the review is
not decorative — it gates something.

**Consequences.** Build output is deterministic (no timestamps, no randomness), so two builds of the
same graph are byte-comparable, and the generated `checks.mjs` verifies the generated `glue.js`
against the graph it came from.

**Revisit when** blueprint §33's fuller gauntlet lands and the gate should consider more than one
reviewer's high-severity findings.
