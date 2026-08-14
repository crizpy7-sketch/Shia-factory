# Operating BORIS-001

## Submitting work

Objectives are text. BORIS does reconnaissance first, so context beats instruction:

```sh
node dist/src/cli.js submit \
  "The billing service returns 500 on refunds over £100. Find the cause, repair it, and prove the
   fix with the existing test suite." \
  --workspace ./workspaces/billing --priority high
```

A good objective names the observable symptom and the verification. A bad one names the fix — that
is the part BORIS is supposed to work out.

## Task lifecycle

```
queued → planning → working ⇄ verifying → completed
              ↓         ↓         ↓
           blocked  awaiting_approval  failed → queued (retry)
```

- `blocked` — a limit was reached, or a provider failed. Requeue with `submit` again or raise the
  limit; the evidence is preserved.
- `awaiting_approval` — BORIS wants an action outside his authority. Nothing proceeds until a human
  decides.
- `failed` — the attempt budget is spent, or BORIS reported that he could not do it. Read
  `task.error` and `task.evidence` before retrying.

## Approvals

```sh
node dist/src/cli.js tasks awaiting_approval
node dist/src/cli.js approve apr_xxx --note "authorised for the staging release"
node dist/src/cli.js reject  apr_xxx --note "not until the migration lands"
```

An approval request always carries four fields: the action, why BORIS wants it, the risk, and what
happens if you approve. Approving requeues the task; rejecting fails it with the reason recorded.

## Reading what happened

```sh
node dist/src/cli.js task task_xxx     # status, evidence, tool calls, usage
node dist/src/cli.js status            # heartbeat, current task, queue depth
```

The dashboard shows the same data live. Evidence entries marked `✗` are the interesting ones: a
failed verification is BORIS catching himself.

## Troubleshooting

| Symptom | Cause | Action |
| --- | --- | --- |
| Every task blocks with `provider failure` | No API key, or the vendor is down | `curl localhost:8787/api/health` shows `providerAvailable:false`; set `ANTHROPIC_API_KEY` |
| Tasks sit in `queued` forever | No worker running | Start `cli.js worker`; check its logs for a crash loop |
| `The scripted provider is a test double` at startup | `BORIS_PROVIDER=scripted` in a real deployment | Set `BORIS_PROVIDER=anthropic` |
| Task blocked with `model call budget exhausted` | The objective is bigger than the budget | Raise `BORIS_MAX_MODEL_CALLS`, or split the objective |
| Tool calls denied with `escapes the authorised workspace` | The work is outside `BORIS_WORKSPACE_ROOTS` | Add the directory deliberately; do not widen the root to `/` |
| `command contains shell metacharacters` | A pipeline or redirect was requested | There is no shell by design; run one binary, or add a script file to the workspace and run that |
| Verification keeps failing on a correct fix | The nominated command is wrong or needs install | Check `task.evidence` for the exact command and exit code |
| Dashboard shows `DISCONNECTED` | SSE blocked by a proxy | Disable proxy buffering, or set a token — the dashboard falls back to polling |

## Costs

Usage is recorded per model call: provider, model, input tokens, output tokens, latency, and cost
when the provider gives a pricing basis. For models without a price in the table the cost is `null`
and the dashboard says *provider reports no pricing* rather than showing zero.

Ceilings live in `.env` (`BORIS_MAX_COST_USD`, `BORIS_MAX_MODEL_CALLS`, `BORIS_MAX_TOOL_CALLS`,
`BORIS_MAX_TASK_MS`, `BORIS_MAX_WORKERS`, `BORIS_MAX_WORKER_DEPTH`). Reaching one blocks the task
and emits `limit.reached`; it never silently continues.

## Memory and skills

BORIS stores durable lessons, not logs. Categories: `identity`, `procedural`, `episodic`,
`failure`, `research`, `task`. Every record carries source, provenance, confidence and a
verification flag, and can be superseded rather than deleted.

`cli.js bootstrap` imports `agents/BORIS-001` into memory. It is idempotent — ids are content-stable,
so re-running updates instead of duplicating. Empty ledgers stay empty and are reported as skipped:
the failure library and research ledger arrived empty in the transfer and are not reconstructed
from guesses.

Skills are versioned procedures selected by trigger overlap with the objective, so the whole library
is never injected. BORIS can write new ones with `skill_create` when a lesson repeats.

## Schedules

```sh
curl -XPOST localhost:8787/api/schedules -H "authorization: Bearer $BORIS_API_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"name":"nightly reliability sweep","kind":"recurring","intervalMs":86400000,
       "objective":"Review the workspace for reliability regressions and report findings."}'
```

Schedules live in the database, so they survive restarts. A recurring schedule that missed runs
while the process was down fires **once** and re-anchors — a day of downtime does not become a
burst of tasks.
