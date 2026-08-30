# Shia Factory Core v2 Architecture

Status: canonical migration architecture  
Authority: Shia Factory Core v2 Project Brief  
Registry: `factory/registry/core-v2.json`  
Application profile: `APP_PROFILE.yaml`

## 1. Mission and invariants

Shia Factory is the permanent reusable control plane used to plan, design, build, verify, deploy,
observe, learn from, and improve every serious Shia application.

The governing reuse rule is:

> Do not create a new permanent agent or skill for every application. Search and upgrade the
> existing Factory first.

The repository, versioned specifications, tests, evidence receipts, and explicit human decisions are
authoritative. A model claim, remembered conversation, unchecked box, or attractive demo is not
evidence of completion.

## 2. System boundaries

```text
APP_PROFILE + product intent
        ↓
Shia Core: reuse search + risk + routing
        ↓
Permanent roles + seven skill packs
        ↓
GStack engineering workflows + approved tools/adapters
        ↓
Exact candidate + Quality Gate evidence
        ↓
Human approval when required
        ↓
Merge/deploy/observe
        ↓
Verified reusable learning → GBrain + Factory Shelf
```

GStack is the upstream engineering execution layer. GBrain is the persistent retrieval substrate.
Neither overrides Factory policy, current repository truth, permissions, or acceptance evidence.

## 3. Five permanent roles

| Role | Owns | Independence and authority |
| --- | --- | --- |
| Shia Core | Intake, orchestration, planning, context compilation, reuse search, risk classification, role/skill/tool selection and lifecycle state | Routes work but cannot waive policy or Quality Gate evidence |
| BORIS | Architecture, frontend, backend, database, AI integration, debugging, DevOps and release engineering | Produces and repairs candidates; cannot independently certify its own high-risk work |
| Design Director | UX, visual design, Figma, design systems, responsive design, motion, accessibility and product taste | Approves design evidence; does not merge or deploy |
| Gary | Product strategy, customer research, positioning, marketing, launch, growth and analytics interpretation | Advises and prepares growth work; publishing/spending remain permission-gated |
| Quality Gate | Functional, integration, browser, visual, accessibility, security, performance, adversarial and release verification | Independent release gate; may reject and request rework; does not silently repair the candidate it judges |

`factory/registry/core-v2.json` is the machine-readable roster. A registered role may be `missing`,
`partial`, or `operational`; registration never implies implementation or certification. The
lowercase folders under `agents/` are compatibility destinations only during Phase 1. Existing
portable packages remain at `agents/BORIS-001/` and `agents/GARY-001/` until a separately reviewed
migration proves replacement paths.

## 4. Seven skill packs

| Pack | Scope |
| --- | --- |
| Product | Intake, discovery, requirements, product specification, prioritization and acceptance criteria |
| Design | UX, UI, responsive behavior, design systems, motion and accessibility design |
| Engineering | Architecture, implementation, databases, DevOps, release engineering and debugging |
| AI | Provider abstraction, prompts, agents, retrieval, evaluation, safety and AI observability |
| Quality | Test strategy, automated verification, browser/visual QA, security and performance review |
| Growth | Research, positioning, launch, distribution, experiments and analytics interpretation |
| Operations | Deployment, monitoring, incidents, runbooks, maintenance and learning loops |

Phase 1 pack folders are indexes, not executable skills. An executable skill exists only when a
reviewed `SKILL.md` and its evidence are admitted later. Existing procedures
`skills/factory-runtime-wiring/` and `skills/factory-learning-loop/` remain valid and unmoved until
Phase 2 maps them into packs without breaking callers or copying upstream GStack skill bodies.

## 5. Reuse hierarchy and Factory Shelf

```text
Factory Core
  → Blocks
    → Modules
      → Blueprints
        → Applications
```

- **Blocks** are one reusable capability, such as authentication, forms, uploads, calendar,
  notifications, realtime, AI gateway, payments, analytics or audit logs.
- **Modules** combine blocks into a coherent domain capability, such as scheduling, household
  coordination, small-business operations, AI learning or media processing.
- **Blueprints** define reusable product structure, such as Family OS, Business OS, Tutor or AI
  Kiosk.
- **Applications** add brand, configuration and unique product/business logic to blueprints.

Every intake must search Core → Blocks → Modules → Blueprints before proposing a new capability.
Shelf admission later requires a manifest, ownership, documentation, examples, tests, version,
security/permission review appropriate to risk, and a passing Quality Gate receipt. Phase 1 creates
the structural homes only; it does not admit existing assets automatically.

Phase 6 implements that boundary at `factory/shelf/` and
`boris/src/factory/reusable-shelf.ts`. Stored status is not authority: a trusted adapter must resolve
and verify the Phase 5 exact-candidate receipt, a Git-tree proof for every declared source/artifact
path at `exactSource.candidateSha`, and the complete admitted/version-compatible dependency chain
before an asset is eligible for normal reuse. Current-checkout existence is not admission evidence.
Exact `REUSE` requires canonical capability IDs or explicit aliases plus platform/interface
compatibility; fuzzy similarity can only suggest discovery or `EXTEND`. The
provider-neutral factual trust contract is designed for future `/.well-known/` exposure without
source code, secret material, “AI approved” language or claims of independent certification.

## 6. Golden App Stack and adapters

The default stack is Next.js + TypeScript, GitHub, Figma/design tokens, Supabase when appropriate,
OpenAI behind a provider abstraction, unit/integration/browser/visual tests, GitHub Actions,
Vercel and/or VPS through a deployment abstraction, Stripe when required, standard analytics events,
and versioned Markdown documentation. Deviations require a recorded technical reason.

`adapters/` isolates replaceable providers and deployment targets from product logic. Applications
depend on Factory contracts, not directly on a single AI, database, payment, analytics, hosting, or
design vendor.

## 7. Tool ownership

| Tool/domain | Accountable role | Required controls |
| --- | --- | --- |
| GitHub/source control | BORIS | Branch isolation, exact SHA, review receipt and human merge approval when required |
| Figma/design system | Design Director | Design provenance, responsive states and accessibility review |
| Canva/marketing design | Design Director | Brand/design review; Gary owns campaign intent, not visual-system authority |
| Google Drive/project documents | Shia Core | Least disclosure, verified file identity and versioned repository copies for governing artifacts |
| Supabase/database | BORIS | Least privilege, migration review, rollback plan and private-data classification |
| OpenAI/AI providers | BORIS | Gateway abstraction, secret isolation, evaluation and usage limits |
| Browser/visual verification | Quality Gate | Exact candidate, reproducible steps and retained evidence |
| Vercel/VPS deployment | BORIS | Deployment abstraction, approval, rollback and operation receipt |
| Stripe/payments | BORIS | T3/T4 review, test mode evidence and explicit production approval |
| Analytics interpretation | Gary | Event definitions and evidence; no unapproved tracking expansion |
| GStack/GBrain | Shia Core | Narrow context, upstream compatibility and provenance-preserving writes |

Accountability is not unlimited authority. Tool availability never grants permission to use it.

## 8. APP_PROFILE and risk routing

Every serious application carries `APP_PROFILE.yaml`. It declares identity, product/blueprint,
platforms, stack, data sensitivity, integrations, baseline risk, required roles, quality modes,
approval requirements and whether reuse search is mandatory.

Risk follows consequence and uncertainty:

| Tier | Typical consequence | Minimum routing |
| --- | --- | --- |
| T0 | Documentation or trivial presentation | Smallest capable worker + check |
| T1 | Isolated low-risk component | BORIS or relevant owner + automated check |
| T2 | Normal feature behavior | Shia Core routing + BORIS + required design/growth owner + Quality Gate evidence |
| T3 | Authentication, payments, private data, important migrations | Read-only recon + independent Quality Gate + security review + human approval as specified |
| T4 | Production infrastructure, irreversible, regulated or safety-critical authority | Architecture/human approval before writes + isolated implementation + full independent evidence |

Shia Core selects the minimum sufficient roles, packs and tools. More agents are not progress. T3/T4
work cannot be downgraded because the diff is small.

## 9. Quality Gate

Quality Gate evaluates the exact candidate and emits a machine-readable/verifiable receipt containing:

- task and application identity;
- base and candidate SHA/digest;
- changed paths;
- risk tier;
- acceptance-criterion results;
- typecheck, lint, unit, integration and browser results as required;
- visual, accessibility, security and performance evidence as required;
- reviewer identity and independence;
- known limitations;
- authorization state and time.

A material candidate change invalidates the receipt. Failed gates return bounded rework to BORIS and
then retest. Repair-budget exhaustion escalates; it never loops indefinitely or claims completion.

## 10. Permission model

Permissions are enforced in code and infrastructure, not only prompts:

- least privilege and narrow path/tool grants;
- read-only reconnaissance before T3/T4 mutation;
- no secret exposure through logs, memory, prompts or browser surfaces;
- no shell metacharacter, path traversal or unapproved destructive action;
- external publishing, spending, messaging, production mutation, merge and deploy are gated;
- one writer owns a mutable resource at a time;
- approval binds to an exact candidate and expires when it changes;
- human approval is required wherever `APP_PROFILE`, risk policy or task contract says so.

Existing BORIS permission, command, path and HTTP allowlist enforcement remains compatible and must
not be weakened during migration.

## 11. Migration and deprecation rules

1. Preserve a baseline SHA and use isolated branches/workspaces.
2. Add canonical paths alongside working legacy paths before moving anything.
3. Separate path moves from semantic behavior changes.
4. Provide compatibility indexes/adapters and test both old and new references.
5. Mark legacy concepts deprecated before removal; record owner, replacement and removal gate.
6. Never delete portable agent identity, provenance, ledgers or evidence merely to normalize layout.
7. Do not invent implementation or certification for a scaffolded role/pack.
8. Do not create a new permanent agent unless the three-part New-Agent Rule passes.
9. Do not create a new standalone skill when an existing pack can absorb the knowledge.
10. Remove a legacy path only after consumers migrate, compatibility tests pass, rollback exists and
    Cristian approves the exact candidate.

Council-first routing, duplicate permanent identities and app-specific standalone skill proliferation
are deprecated concepts. Historical records stay readable.

## 12. Canonical repository structure

```text
shia-factory/
├── factory/{orchestrator,registry,policies,quality,memory}
├── agents/{shia-core,boris,design-director,gary,quality-gate}
├── skills/{product,design,engineering,ai,quality,growth,operations}
├── blocks/
├── modules/
├── blueprints/
├── adapters/
├── dashboard/
├── docs/
└── tests/
```

Canonical folders may coexist with legacy paths throughout migration. Their presence proves only
that the structural home exists; operational status comes from registries, implementation and tests.

## 13. Phase boundaries

Phase 1 is complete only when the audit, preserved baseline, canonical compatibility structure and
this architecture document all exist with verification evidence. Phase 1 does not implement the
missing roles, executable seven-pack taxonomy, orchestrator selection, Shelf admission, Quality Gate
runtime or Michel OS pilot. Those remain later phases and must not be marked complete early.
