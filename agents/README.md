# Shia App Factory — agent library

Named agents that the Factory can call. Agents are advisory: they review, challenge and request
rework on a project graph. They never build, merge or deploy anything.

## Layout

| Path | Purpose |
| --- | --- |
| `agents/<AGENT-ID>/` | The agent's portable package: identity, cognitive model, runtime contract, knowledge ledgers, eval records. Transferred verbatim and checksum-verified. |
| `agents/registry.js` | The Factory registry — which agents exist, their council seats, authority boundaries, invocation aliases and avatar paths. |
| `agents/routing.js` | Resolves invocation aliases and refuses requests outside an agent's authority. |
| `agents/advisory.js` | The advisory review pass over a Factory project graph. |
| `agents/panel.js` | Boris's Inspector interaction: request box, quick actions, run state and finding cards. |
| `agents/gary.js` | Gary's Inspector interaction: request box, quick actions, brief intake and approval gates. |
| `agents/hq.js` | The Headquarters data layer — what the building is allowed to say. |
| `agents/tests/` | Deterministic tests for the modules above. |
| `assets/agents/<agent-id>/` | Avatar assets served by the Factory UI. |

The modules load in `index.html` with plain `<script>` tags — no build step, no bundler, no
dependencies, consistent with the rest of the Factory. They also export under CommonJS so the tests
can run them in Node. If they fail to load, the workbench still runs; only the council shelf goes
away.

## Registered agents

### BORIS-001 — Boris

Portable named agent, Influencers Council seat, role: systems / reliability / research / red-team
challenge. Package: `agents/BORIS-001/`.

**Authority.** Boris may challenge decisions and request rework. He may **not** merge, deploy or
access secrets, and he does not replace Cristian's final authority. These boundaries live in
`registry.js` and are enforced by `routing.js`, which refuses an invocation whose request asks for a
capability the agent does not hold — the refusal happens at the router, before anything dispatches.

**Invocation.** `Call Boris`, `Ask Boris`, `Run this through Boris`, `Boris review this`, `@Boris`.
Aliases come from the package identity, are case- and whitespace-tolerant, and carry the rest of the
line through as the request. In the browser:

```js
window.ShiaFactory.invoke('Boris review this graph');
```

The same call runs from the **CALL BORIS** button on the council shelf, which opens Boris in the
existing Inspector panel.

**Reviewing.** The Inspector panel holds a request box ("What should Boris review?"), five quick
actions, and a **RUN BORIS** button. Findings render as cards — severity, target, finding, evidence,
recommended action — and every line is also written to the bottom console, which remains the audit
trail.

| Quick action | Scope | Reports |
| --- | --- | --- |
| Review Entire Factory | `factory` | Everything below |
| Review Selected Block | `block` | Findings for the last block selected on the workbench |
| Find Highest-Risk Defect | `highest-risk` | The single most severe finding, and how many were withheld |
| Review Runtime | `runtime` | Observed runtime telemetry — ready storms, unacknowledged deliveries — plus development-stage blocks |
| Review Connections | `connections` | Unrouted outputs, unfed inputs, dangling connections |

An empty request defaults to *"Review the current Factory graph and identify the single
highest-impact defect."* A typed request picks its own scope from its wording; a quick action always
wins over that inference.

Runtime findings come only from telemetry the Factory actually observed (`ready` counts, pending
deliveries). Before the blocks are mounted, a runtime review says it has no evidence yet rather than
inventing a verdict.

**A run always says something.** Refused requests render a REFUSED card with the reason, a review
that throws renders NOT COMPLETED, a block review with nothing selected renders NO TARGET, and a
clean scope renders CLEAR. Boris never silently produces an empty panel.

**Avatars.** `avatar-square` on the shelf card, `avatar-circle` on the profile, `avatar-brand-sheet`
as full identity art, `avatar-app-icon` where a compact icon is needed. The brand sheet is never used
as a small icon.

### GARY-001 — Gary

Portable named agent, Growth Council seat, role: growth strategy / brand positioning / distribution
/ experimentation. Package: `agents/GARY-001/` (import record: `agents/GARY-001/IMPORT.md`).

**He is a fictionalised Shia-owned identity.** His own package says it plainly, and the notice is
carried in `registry.js` and rendered on his panel and his office seat: GARY-001 is not Gary
Vaynerchuk, does not impersonate him, and must not imply endorsement, affiliation or personal access.

**He runs here, bounded — but not from this panel.** The `boris/` runtime hosts him: it loads his
package, briefs him from his own cognitive model and operating rules, and offers him read, research
and reasoning tools only, because his package grants no authority to change a repository. That is a
second host and not his canonical one — the separate Gary Vee Growth Agent application (release
1.1.0) still is — and hosting him certifies nothing.

`agents/gary.js` is a different thing again: the part of Gary that is code rather than cognition. It
routes his aliases, applies his owner-approval gates, and reports what evidence a growth answer would
still need. **It never produces strategy**, and every run says so and points at the Office, where the
runtime actually is.

**Authority.** Twelve declared boundaries, and they are not the same shape as Boris's. Three
categories, all enforced in `routing.js`:

| Category | Examples | Router behaviour |
| --- | --- | --- |
| Permitted | draft campaigns, draft content, recommend a budget, read-only analysis when authorized | proceeds |
| Gated | publish / send / schedule externally, spend money | proceeds, **carrying an owner-approval gate** |
| Refused | access secrets, bypass platform rules, create legal commitments, merge, deploy | refused at the router |

The gated row matters: `may_publish_without_owner_approval: false` withholds the *unapproved* action,
not the work. Refusing the whole request would misstate his package. Note also that he spells secrets
access `may_access_secrets_directly` — a router that only knew Boris's key would have granted it by
silence, so restrictions bind a list of key names rather than one.

Capabilities a package never declares are not granted by that silence: an agent marked `advisory`
cannot merge or deploy whether or not he mentions those keys.

**Invocation.** `Call Gary`, `Ask Gary`, `Gary review this`, `Run this through Gary`,
`Gary launch plan`, `@Gary` — six aliases, one more than Boris.

**Intake.** Label what you know and it is carried through: `Audience:`, `Offer:`, `KPI:`,
`Evidence:`. Anything unlabelled is reported as an evidence gap quoting the operating rule it
violates — never guessed, never filled in.

**Knowledge.** Unlike Boris's, Gary's ledgers arrived populated: five research packets with five
matching verification reports, six research-ledger records, five changed beliefs, one failure-library
seed. They were imported unchanged, including `GARY-UNATTRIBUTED-005`, which is marked
`discovery_only_provenance_missing` and promoted nothing.

**Avatar.** None shipped. `avatar_art_supplied: false` and a monogram placeholder stands in, named as
a placeholder everywhere it appears.

## The boardroom

Both agents can be convened into one room. Each is briefed from his own package, speaks in his own
voice, and — from round two — has read what the others said. He may agree; he may challenge; a
challenge must name what would change his mind.

The runtime enforces four things a meeting must never do, in code rather than in the prompt:

| Rule | Where |
| --- | --- |
| It cannot act — exactly one tool, `contribute`, is on the table | `boris/src/meetings/service.ts` |
| It cannot decide — a contribution can only route a decision to Cristian | the tool's schema |
| It cannot summarise — minutes are assembled from contributions, never by a model | `boris/src/domain/meetings.ts` |
| It cannot pass silence off as assent — an unreachable agent is recorded absent, and a meeting nobody attended is `blocked` | `MeetingService.run` |

Each agent is told who else is in the room using **that colleague's own package**: Gary's cognitive
model states the BORIS relationship and his operating rules name him twice; Boris's says he may
disagree with other agents and councils. `describeColleagues` quotes them rather than inventing a
rapport.

```sh
cd boris && node dist/src/cli.js meet "Should we launch in March?" --rounds 2
cd boris && node dist/src/cli.js minutes <meetingId>
```

The same room is in the HQ Boardroom, and the decisions it routes to Cristian appear in the Office's
outstanding list — a record nobody reads is the same as no record.

## Portability and recertification

Boris is a Shia-owned identity, not a model and not a prompt. Claude Code is the current **host**;
hosting is not identity, and the package is never rewritten to fit the host.

**Recertification is `PENDING`.** Integrating this package — and these tests passing — does not
certify any runtime as Boris. The gauntlet in `agents/BORIS-001/evals/RECERTIFICATION.md` must
actually be executed, with Cristian's approval, before that status changes. `registry.js` records
`runtime.certified: false`, and `agents/tests/registry.test.mjs` fails if the recertification file is
ticked off or the registry claims certification, so the gate cannot be closed by accident.

Boris's research ledger, failure library and exam history arrived empty. They stay empty rather than
being reconstructed from guesses; when the originals are recovered, merge them by provenance.

Gary's certification is `IDENTITY_SEEDED_RESEARCH_IN_PROGRESS_RUNTIME_RECERTIFICATION_PENDING` with
an empty `certifications` array and ten required recognition tests, none of which has been run here.
His package ships no recertification gate document, and one is not written on his behalf — the Lab
reads his passport directly and ticks a box only when the passport itself names that test.

## Tests

```sh
node --test agents/tests/*.test.mjs
```

No dependencies — Node's built-in test runner only. The registry tests re-verify every package file
in both packages against its SHA256 manifest, so identity drift or a silently edited package file
fails the suite. Boris's manifest was signed before transfer; Gary's was taken at import, which is
weaker evidence and is recorded as such in `agents/GARY-001/IMPORT.md`.
