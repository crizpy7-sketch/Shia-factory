# Shia App Factory — agent library

Named agents the Factory can call. Agents review, challenge and request rework on a project graph.
One of them — Boris — also **builds** from it, under a recorded grant. None of them merges, deploys,
publishes, spends, or reaches a secret.

## Layout

| Path | Purpose |
| --- | --- |
| `agents/<AGENT-ID>/` | The agent's portable package: identity, cognitive model, runtime contract, knowledge ledgers, eval records. Checksum-verified, never rewritten to fit the host. |
| `agents/registry.js` | The Factory registry — who exists, council seats, package authority, **Factory grants**, capability modules, invocation aliases, avatars, and the Factory's rooms. |
| `agents/routing.js` | Resolves invocation aliases and refuses requests outside an agent's effective authority. |
| `agents/advisory.js` | BORIS-001's review pass — reliability and structure. |
| `agents/growth.js` | GARY-001's review pass — positioning, funnel and measurement. |
| `agents/build.js` | BORIS-001's build pass — compiles the graph into a runnable export. |
| `agents/panel.js` | The agent-agnostic Inspector interaction: request box, quick actions, run state, finding and artifact cards. |
| `agents/tests/` | Deterministic tests for all of the above. |
| `assets/agents/<agent-id>/` | Avatars served by the Factory UI. |

The modules load in `index.html` with plain `<script>` tags — no build step, no bundler, no
dependencies — and also export under CommonJS so the tests can run them in Node. If they fail to
load, the workbench still runs; only the councils go away.

## Authority: two layers, kept apart

`registry.js` holds two different things and never confuses them.

**`authority`** is restated verbatim from the agent's package `identity.json`. The tests fail if it
drifts. This is what the agent's origin council said it may do.

**`grants`** are capabilities Cristian granted *inside the Factory*, each recorded with grantor,
date, scope, reason, and a `withheld` list. This is what the Factory added.

`registry.capabilities(agent)` merges them into the effective set. A grant can only add — it can
never flip a boundary the package or the grant's own `withheld` list closes, and there is a test for
a rogue grant that tries. Widening what an agent may do therefore stays a visible Factory decision
rather than a quiet rewrite of a transferred identity.

Enforcement is **deny-unless-held**: `routing.js` permits a restricted request only when the
effective capability is exactly `true`. A capability an agent never declares counts as withheld, so
a newly registered agent starts out unable to merge, deploy, publish, spend or write code. The
refusal happens at the router, before anything dispatches.

## Registered agents

### BORIS-001 — Boris

Influencers Council. Systems, reliability, research, red-team challenge. Package:
`agents/BORIS-001/`, transferred with its own SHA256 manifest.

**Authority.** Challenge decisions, request rework. **Not** merge, deploy or access secrets.

**Grant `BORIS-BUILD-001`.** Cristian granted `may_author_code`, `may_build`, `may_scaffold_blocks`
and `may_run_tests`, scoped to the Factory, with merge/deploy/secrets explicitly restated as
withheld. Boris writes the artifact and the checks for it; landing it stays with Cristian.

**Invocation.** `Call Boris`, `Ask Boris`, `Run this through Boris`, `Boris review this`, `@Boris` —
from the package — plus `Boris build this` and `Boris build`, which come from the grant and
disappear with it.

**Reviewing.** Five scopes: entire Factory, selected block, highest-risk defect, runtime,
connections. Findings render as cards — severity, target, finding, evidence, recommended action —
and every line also goes to the console, which remains the audit trail. Runtime findings come only
from telemetry the Factory actually observed; before the blocks are mounted, a runtime review says
it has no evidence yet rather than inventing a verdict.

**Building.** `agents/build.js` compiles the current graph into a runnable export:

| Artifact | What it is |
| --- | --- |
| `glue.js` | Generated routing table and delivery/ack engine, speaking the real block `postMessage` contract |
| `shia-app.html` | Shell page that mounts each block runtime and loads the glue |
| `checks.mjs` | Executable checks verifying the glue against the graph it came from |
| `README.md` | How to run it, and what Boris did *not* do |
| `build-manifest.json` | Graph fingerprint, artifact digests, and the withheld capabilities |

Three rules shape it. He builds **from the graph, never from intent** — every route comes from a
connection that exists. He **refuses to build over a defect he can see**: a high-severity advisory
finding blocks the build and returns the blockers instead of an artifact, unless you Force it, in
which case the result says so. And **building is not landing** — the module returns files, touches
no disk and no network, and has no code path to publishing anything.

Output is deterministic: same graph in, byte-identical artifacts out. No timestamps, no randomness,
so two builds are directly comparable. Moving a block on the canvas does not change the build;
rewiring it does.

### GARY-001 — Gary

Growth Council. Growth strategy, brand positioning, distribution, experiments. Package:
`agents/GARY-001/`.

**Authority.** Generate campaigns and content drafts, recommend budget, run read-only analysis when
authorized, challenge and request rework. **Not** publish without owner approval, spend money, access
secrets, bypass platform rules, or make legal commitments. No Factory grant — Gary drafts;
publishing and spending stay with Cristian.

**Invocation.** `Call Gary`, `Ask Gary`, `Gary review this`, `Run this through Gary`,
`Gary launch plan`, `@Gary`.

**Reviewing.** Five scopes: entire Factory, highest-impact gap, positioning, funnel, measurement.
Every finding is read off the graph — an unrouted capture step is lost follow-up, a default project
name is an unmade positioning decision, capture with nothing retaining it means you can report volume
and nothing else. He does not state a figure he has not been shown, and a test asserts no finding
contains a percentage, multiplier or currency amount.

Gary and Boris will sometimes flag the same edge. That is the councils working: an output with no
destination is a dropped record to one and lost follow-up to the other, and the two rework actions
differ.

**Provenance notes.** The GARY-001 package arrived without a transfer manifest, so
`agents/GARY-001/SHA256_MANIFEST.json` is a baseline recorded at integration — it detects drift from
here on, it does not attest a transfer the way Boris's does. The registry says so
(`package_integrity`). It also shipped **no avatar art**, so the Factory shows a generated monogram
that reads `PLACEHOLDER` in the artwork itself, marked `avatar_provenance: 'placeholder'` and
disclosed in the Office and the Inspector.

GARY-001 is a Shia-owned identity informed by public marketing principles. It is not a real person,
implies no endorsement or affiliation, and the Factory surfaces that notice wherever he appears.

## The rooms

`registry.rooms` drives four views in `index.html`, all registry-fed — registering an agent puts it
in every one of them without a line of shell code changing.

| Room | Shows |
| --- | --- |
| **Workbench** | The block graph. Drag, wire, run the real runtimes. |
| **Lab** | Each agent holding a build grant, its grant terms, and its last build — artifacts, sources, downloads, checks. |
| **Office** | One desk per agent: identity, roles, what it can do, aliases, package provenance, granted vs withheld, who it answers to. |
| **Headquarters** | Councils and seats, plus the standing authority matrix across every agent — `✓` held by the package, `✓` granted in the Factory, `✗` withheld, including anything an agent never declares. |

## Adding an agent

Add its package under `agents/<AGENT-ID>/`, add an entry to `registry.js` with a review module, and
that is the whole job. The shelf, the router, all four rooms and the Inspector pick it up. The panel
is agent-agnostic — quick actions come from the review module's own `SCOPES`, so an agent's scopes
and its buttons cannot drift apart — and `modulesFor` withholds any module whose capability the
agent lacks, which is why Gary gets no builder.

## Portability and recertification

Boris and Gary are Shia-owned identities, not models and not prompts. Claude Code is the current
**host**; hosting is not identity, and the package is never rewritten to fit the host.

**Recertification is `PENDING` for both.** Integrating a package — and these tests passing — does not
certify any runtime as that agent. Boris's gauntlet in `agents/BORIS-001/evals/RECERTIFICATION.md`
must actually be executed, with Cristian's approval, before that status changes. `registry.js`
records `runtime.certified: false`, and `agents/tests/registry.test.mjs` fails if the recertification
file is ticked off or the registry claims certification, so the gate cannot be closed by accident.
Gary additionally carries an open research gate — his cognitive model is not source-final.

Boris's research ledger, failure library and exam history arrived empty. They stay empty rather than
being reconstructed from guesses; when the originals are recovered, merge them by provenance.

## Tests

```sh
node --test agents/tests/*.test.mjs
```

111 tests, no dependencies — Node's built-in runner only.

| File | Covers |
| --- | --- |
| `registry.test.mjs` | BORIS-001 against his package, byte-for-byte, including the recertification gate |
| `agents.test.mjs` | GARY-001 against his package, the grant layer, and both agents' boundaries at the router |
| `routing.test.mjs` | Alias resolution and refusals |
| `advisory.test.mjs` | Boris's review pass |
| `growth.test.mjs` | Gary's review pass |
| `build.test.mjs` | Boris's build pass — including writing the export to a temp directory and running the checks *he* generated against the glue *he* generated |
| `panel.test.mjs` | The Inspector interaction |

The registry tests re-verify every package file against its SHA256 manifest, so identity drift or a
silently edited package file fails the suite.
