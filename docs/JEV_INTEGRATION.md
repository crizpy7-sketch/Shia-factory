# TypeSafe / Jev judgment tool (opt-in)

This is an **optional, additive** integration. It is **not** a Core v2 phase deliverable.

- It does **not** advance Phase 7 or Phase 8.
- It does **not** change the Core v2 scoreboard percentages in `docs/STATUS.md`.
- It ships **disabled by default**.

## What it is

Boris exposes a judgment-only tool, `jev_system_one`, that calls TypeSafe’s System One API
(`POST /v1/systemone`) via native `fetch`. There is **no** `@typesafe-ai/sdk` dependency — the
runtime stays dependency-free at runtime.

Code owns the workflow. Jev returns **typed answers** (noul probabilities, choice labels,
score expectations), not free-form agent prose. Treat answers as data.

## What it is not

- Not a write / shell / git / deploy capability
- Not required for Core v2 progress
- Not enabled merely by having a key on the host — both the opt-in flag **and** a key are required
- Not a place to put secrets in the repository

## How to enable

1. Obtain a TypeSafe API key (never commit it).
2. In the runtime environment (e.g. `boris/.env`, not checked in):

```bash
BORIS_JEV_ENABLED=true
TYPESAFE_API_KEY=...          # or BORIS_TYPESAFE_API_KEY=...
# optional:
# BORIS_TYPESAFE_BASE_URL=https://api.typesafe.ai
# BORIS_TYPESAFE_MODEL=jev-latest
```

3. Restart the runtime. Without `BORIS_JEV_ENABLED=true` **or** without a key, `jev_system_one`
   authorizes as **deny** with a clear reason.

## Tool contract

| Field | Meaning |
| --- | --- |
| `state` | Object, array, null, plain text, or JSON string — the material under judgment |
| `questions` | Map of id → `{ type: 'noul' \| 'choice' \| 'score', instructions, criteria? }` (or JSON string) |
| `model` | Optional override; default `jev-latest` / `BORIS_TYPESAFE_MODEL` |

Sensitivity: **safe** (judgment-only). Gary’s roster allowlists `jev_system_one`; he remains
write-denied (no write / shell / git / deploy tools).

## Research allowlist

`api.typesafe.ai` and `docs.typesafe.ai` are on `DEFAULT_FETCH_ALLOWLIST` so `http_fetch` can
read public TypeSafe docs. The System One call itself uses the dedicated client, not `http_fetch`.

## Credential env names

| Variable | Role |
| --- | --- |
| `BORIS_JEV_ENABLED` | Opt-in gate (`true` to enable); default false |
| `TYPESAFE_API_KEY` | Preferred API key |
| `BORIS_TYPESAFE_API_KEY` | Alternate API key |
| `BORIS_TYPESAFE_BASE_URL` | API root; default `https://api.typesafe.ai` |
| `BORIS_TYPESAFE_MODEL` | Default model; default `jev-latest` |

Never log the API key. Never commit a filled `.env`.
