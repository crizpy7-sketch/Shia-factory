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
| `agents/panel.js` | The Inspector interaction: request box, quick actions, run state and finding cards. |
| `agents/tests/` | Deterministic tests for the three modules above. |
| `assets/agents/<agent-id>/` | Avatar PNGs served by the Factory UI. |

The three modules load in `index.html` with plain `<script>` tags — no build step, no bundler, no
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

## Portability and recertification

Boris is a Shia-owned identity, not a model and not a prompt. Claude Code is the current **host**;
hosting is not identity, and the package is never rewritten to fit the host.

**Recertification is `PENDING`.** Integrating this package — and these tests passing — does not
certify any runtime as Boris. The gauntlet in `agents/BORIS-001/evals/RECERTIFICATION.md` must
actually be executed, with Cristian's approval, before that status changes. `registry.js` records
`runtime.certified: false`, and `agents/tests/registry.test.mjs` fails if the recertification file is
ticked off or the registry claims certification, so the gate cannot be closed by accident.

The research ledger, failure library and exam history arrived empty. They stay empty rather than
being reconstructed from guesses; when the originals are recovered, merge them by provenance.

## Tests

```sh
node --test agents/tests/*.test.mjs
```

No dependencies — Node's built-in test runner only. The registry tests re-verify every package file
against `agents/BORIS-001/SHA256_MANIFEST.json`, so identity drift or a silently edited package file
fails the suite.
