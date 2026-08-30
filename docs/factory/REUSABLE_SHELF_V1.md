# Reusable Factory Shelf v1

Status: Phase 6 candidate — pending Cristian review and merge

Runtime: `boris/src/factory/reusable-shelf.ts`

Schemas: `factory/shelf/shelf-asset.schema.json`, `factory/shelf/trust-manifest.schema.json`

Inventory: `factory/shelf/inventory.json`

## Boundary

The Shelf is the governed inventory for reusable Blocks, Modules and Blueprints. It is not a directory
listing, marketing catalog or substitute for Quality Gate. A file, historical implementation,
`manifest.json`, `SKILL.md`, test name or UI label never makes an asset admitted.

Shia Core owns discovery and decisions. BORIS may build or extract a candidate. Design Director,
Gary and Quality Gate participate only where their permanent contracts require them. Phase 5 remains
the evidence authority; Quality Gate records evidence but grants no merge, deploy or other dangerous
authority.

## Manifest and lifecycle

Every manifest records stable ID, layer, version, permanent owner, purpose, path, dependencies,
platforms, interfaces, compatibility, provenance, exact source candidate, Quality Gate reference,
risk/security state, documentation/examples/tests, limitations, maintenance and replacement state.

| State | Meaning | Normal reuse |
| --- | --- | --- |
| `candidate` | Discoverable and unadmitted | No; explicit bounded policy may permit visible extension |
| `admitted` | Trusted adapter verified a passing Phase 5 receipt for the exact source candidate | Eligible when compatible |
| `deprecated` | Superseded and retained for migration/audit | Excluded |
| `revoked` | Invalid or unsafe | Excluded |

Admission is a runtime trust decision, not a writable status string. The trusted adapter resolves a
retained Phase 5 receipt, verifies both receipt and record integrity digests, exact repository/SHA,
risk coverage, admitted evidence provenance, passing criteria/applicable gates, satisfied approvals,
and Shia Core control-plane invariants. Raw caller receipts and a stored `lifecycle: admitted` value
remain untrusted without that resolution.

Admission also invokes the trusted `git-tree-exact-source-v1` repository adapter. It resolves
`exactSource.candidateSha` as a commit and reads Git objects from that tree—not from the current
checkout—to prove that `repository.path`, `provenance.sourcePath`, documentation, examples, tests and
all declared provenance/evidence paths exist. The receipt records each path, Git object ID/type and
an integrity digest bound to the asset, repository and exact source SHA. Missing, outside-repository
or working-tree-only paths fail admission.

The receipt task is asset-scoped as `SHELF-ADMISSION-<type>-<name>-<version>`. A passing receipt from
another task, asset, version, repository or SHA cannot be replayed for admission.

## Layers and dependency rules

- A **Block** is one reusable capability behind a stable interface. Shelf Blocks have no Shelf-asset
  dependency; libraries and provider packages belong in compatibility metadata/adapters.
- A **Module** combines multiple admitted Blocks behind one stable domain interface. A Module may
  depend only on Blocks.
- A **Blueprint** is a reusable application architecture composed from Blocks/Modules. Its manifest
  must also describe APP_PROFILE defaults, permanent-role and pack requirements, quality policy,
  supported stack/integrations, deployment expectations and extension points before admission.
- An **Application** consumes Blueprints/Modules/Blocks and contains brand/configuration/unique logic;
  it is never a dependency of a Shelf asset.

The runtime rejects missing assets, type drift, same/higher-layer dependencies, application coupling
and cycles. Admission additionally requires every dependency to resolve from the actual catalog, use
a valid semantic version range, satisfy that range, remain non-deprecated/non-revoked, and already be
admitted through the trusted boundary. A Module cannot hide candidate Blocks; a Blueprint cannot
hide candidate Blocks or Modules. No non-production escape hatch is currently defined, so no weaker
path can receive normal `admitted` status. The current catalog contains no Module and no Blueprint
because no existing pattern has the required stable interface and trusted admission evidence.
Family OS remains a future outcome of the Phase 7 pilot, not a Phase 6 artifact.

## Existing-asset inventory

The inventory was performed against merged Phase 5 main candidate
`ab3f1eea8760055b15eb0b24f44e859b2107b6d5`.

| Surface | Classification | Shelf result |
| --- | --- | --- |
| Forms #001 | Reusable now | Candidate Block; no Phase 5 receipt |
| Records #002 | Reusable now | Candidate Block; no Phase 5 receipt |
| BORIS auth/permissions/identity loader | Reusable after extraction | Runtime infrastructure, not app identity/auth |
| Portable BORIS/Gary identities | Application-specific | Preserved identity; never an end-user identity Block |
| Scheduler/storage/API | Reusable after extraction | No stable scheduling Module |
| Browser postMessage handoff | Legacy | Local workbench coordination, not realtime/notifications |
| AI provider abstraction | Reusable after extraction | BORIS-coupled, not an admitted AI Gateway |
| SQLite storage contracts | Reusable after extraction | BORIS-domain-specific, not a generic backend Block |
| Events/worker/scheduler | Reusable after extraction | No analytics/audit/background-jobs Block contract |
| Embedded responsive CSS patterns | Duplicate | Needs design-system extraction and real visual/a11y evidence |
| Phase 5 Quality Gate | Reusable now | Factory Core capability, not a self-admitted Block |
| Docker/CI/operations patterns | Reusable after extraction | Environment wiring remains unproven for applications |
| Council-first routing | Deprecated | Compatibility only; owned by five-role consolidation |

Confirmed gaps include general application auth/profiles/households/organizations, files/media,
notifications, network realtime, application AI Gateway, analytics/events, audit log, background
jobs and Stripe/payments. Those gaps are evidence, not permission to manufacture assets in this PR.

## Reuse-before-create decision

```text
normalized capability need
  → load + validate Shelf catalog
  → verify admission through trusted Phase 5 adapter
  → resolve canonical capability IDs and explicit aliases
  → use fuzzy similarity only for discovery/extension suggestions
  → check platform/interface compatibility
  → REUSE only an explicit compatible admitted capability match
  → EXTEND partial admitted asset
  → EXTEND explicit-policy non-admitted asset (state remains visible)
  → CREATE only with recorded per-asset/no-catalog no-match evidence
```

Deprecated/revoked assets cannot satisfy normal reuse. A non-admitted asset is never returned as
exact `REUSE`. The disposition and selected/no-match evidence are embedded in the Phase 3 task
contract and decision receipt. Existing legacy skill/implementation discovery remains compatible and
keeps provenance verification separate from Shelf admission.

Token overlap alone never establishes `REUSE`. For example, an admitted `forms` capability may be a
useful `EXTEND` suggestion for `secure-payment-forms`, but it is not an exact match unless that full
capability is declared as a canonical ID or explicit alias and its platform/interface requirements
also match.

## Factual trust manifest

`deriveFactoryTrustManifest` produces an allow-listed provider/model-neutral record suitable for a
future `/.well-known/` file or endpoint. It includes identity/version, maintainer, source provenance,
Quality Gate receipt references, security review state, last verification time, interfaces/platforms,
maintenance, limitations and deprecation state.

The generator accepts only an in-process asset admitted through the trusted boundary and the exact
receipt used for admission. It rejects secret-shaped content and exposes no source code. The contract
explicitly records that it is not independent certification, not an “AI approved” badge and not
action authority.

## Current limitations

- Forms and Records remain candidate assets; their embedded self-tests are audit context only.
- No production CI, BORIS, browser, GStack or application evidence adapter is claimed to be wired by
  this work. The Phase 5 environment-specific wiring limitation remains.
- No asset was admitted in this candidate because no retained trusted Phase 5 receipt exists for the
  two exact block source candidates.
- No Module or Blueprint was created. Their first instances require real extracted interfaces and
  exact-candidate evidence.
- The profile still uses the existing Phase 3 schema; explicit target platforms may be supplied per
  task and otherwise are derived conservatively from the frontend/app type.
- This candidate changes governance/runtime code and cannot certify or merge itself. Cristian must
  approve the exact PR candidate.
- Michel OS was not inspected or modified. Phase 7 was not started.
