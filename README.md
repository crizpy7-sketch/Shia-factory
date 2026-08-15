# Shia App Factory

A workbench for composing apps out of blocks, and the headquarters of the agents who work on them.

Zero build. Clone it and open `index.html`, or serve the whole building with one command.

```sh
cd boris && npm install && npm run build && node dist/src/cli.js run
```

| Address | What is there |
| --- | --- |
| `/hq` | **Headquarters** — Office, Workshop, Lab, Records |
| `/factory` | The block workbench, full screen |
| `/` | The BORIS Control Center |

## The building

**Office** — who is on staff, what they are working on, what needs your decision. Every figure comes
from the runtime; when it is offline the office says so and gives you the command to start it. It
does not fill the gap with a plausible number.

**Workshop** — the block workbench. Drag blocks onto the canvas, wire `submitted → addRecord`, press
Run Factory and the real block runtimes mount in iframes and pass real records.

**Lab** — evals, exams and certification evidence. Boris's recertification gate and Gary's passport
are read from their files. No box is ticked here; a tick requires the gauntlet actually running and
Cristian's approval.

**Records** — identity, memory, skills, ledgers and provenance. Ledger counts are read from the
ledgers, so an empty one reports empty and a full one reports what it holds.

## The agents

| Agent | Council | State |
| --- | --- | --- |
| **BORIS-001** — Boris | Influencers Council | Systems, reliability, research, red-team challenge. Package transferred and checksum-verified. Executed by the `boris/` runtime. Recertification **PENDING** |
| **GARY-001** — Gary | Growth Council | Growth, brand, distribution, experiments. Package transferred and imported verbatim. **No runtime here executes him** |

Both are advisory. They challenge, they request rework, and they do not land changes. Cristian is
final authority.

Call either from the council shelf, or by name:

```js
window.ShiaFactory.invoke('Boris review this graph');
window.ShiaFactory.invoke('Gary launch plan — Audience: solo consultants. KPI: confirmed subscribers.');
```

Boris reviews the graph and returns findings. Gary routes, applies his approval gates and names the
evidence a growth answer would need — and says on every run that no certified Gary runtime answered,
because none does.

**GARY-001 is a Shia-owned fictionalised identity.** It may be informed by publicly documented
marketing principles associated with Gary Vaynerchuk, but it is not him, does not impersonate him,
and must not imply endorsement or affiliation.

## The runtime

`boris/` is a dependency-free TypeScript agent runtime on Node 22. Boris receives an objective,
inspects the repository, **records a plan before he is allowed to change anything**, edits real
files, runs real commands, and has his success claims re-run by the runtime rather than taken at his
word. A failed verification becomes a repair cycle; a repeated failure becomes memory.

Permissions are code, not prompt text. Commands run without a shell, paths are resolved through
symlinks and contained, credential-shaped paths are refused outright, and deploys, publishing and
spending need a human approval record.

See `boris/README.md` for the runtime and `agents/README.md` for the Factory's agent layer.

## Layout

| Path | What it is |
| --- | --- |
| `index.html`, `blocks/` | The workbench and its block runtimes |
| `hq/` | The headquarters — four rooms, one page |
| `agents/BORIS-001/`, `agents/GARY-001/` | Portable identity packages. Transferred state, never rewritten |
| `agents/*.js` | Registry, routing, advisory, panels, HQ data layer |
| `boris/` | The runtime |
| `assets/agents/` | Avatar assets |

## Tests

```sh
node --test agents/tests/*.test.mjs   # the Factory's agent layer
cd boris && npm run gauntlet          # typecheck, lint, unit, integration, security, e2e
```

225 tests, no dependencies beyond Node's own test runner and TypeScript.

## What is not true yet

Kept here rather than in a footnote, because a repository that overstates itself is worse than one
that does less.

- **No live model has driven the loop in this environment.** There is no API key here. The provider
  adapters are real; `node dist/src/cli.js preflight` and `acceptance` verify a live setup in one
  command when a credential exists.
- **Neither agent is certified.** Boris's recertification gauntlet has not been run with Cristian's
  approval. Gary holds zero of his ten recognition tests. Hosting an agent is not certifying the
  host as that agent.
- **Gary cannot be given work here.** His execution host is a separate application. This repository
  holds his identity and his policy layer.
- **Postgres is not implemented, and MCP servers are not wired.** `Storage` is the port and the tool
  registry is the extension point; SQLite is the only adapter shipped.
