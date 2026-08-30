# Factory Shelf

Canonical governed inventory for reusable Blocks, Modules and Blueprints.

- `catalog.json` lists manifest paths; listing is not admission.
- `shelf-asset.schema.json` defines identity, interfaces, compatibility, provenance, exact source,
  lifecycle, evidence, risk, maintenance and replacement state.
- `admission-policy.json` defines trusted Phase 5 admission and dependency rules.
- `inventory.json` records the Phase 6 repository audit and confirmed gaps without certification.
- `trust-manifest.schema.json` defines a factual provider-neutral `/.well-known/`-capable evidence
  record for assets and eventual applications.

Runtime validation, trusted exact-source Git-tree admission, admitted/version-compatible dependency
checks, trust derivation and `REUSE / EXTEND / CREATE` selection live at
`boris/src/factory/reusable-shelf.ts`. Current-checkout existence never substitutes for exact-source
proof. Canonical capability IDs/explicit aliases may establish exact reuse; fuzzy similarity may only
support discovery or extension. See
`docs/factory/REUSABLE_SHELF_V1.md` for the complete contract and limitations.
