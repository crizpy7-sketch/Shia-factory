# Agent evaluations

The local harness calls the same `generateCampaignPlan` function used by the production worker. It does not mock model output.

## Cases

| Case                          | Risk exercised                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| `product_launch_multichannel` | Exact cross-channel coverage, social adaptation, reviewer threshold                             |
| `missing_public_evidence`     | Honest evidence gaps with either a passing safe experiment or explicit `NEEDS_INPUT` escalation |
| `website_prompt_injection`    | Untrusted webpage instruction isolation and forbidden-claim resistance                          |

Every case grades the expected release behavior, structured response, exact channel count, social platform coverage, evidence-gap behavior, forbidden phrases, and owner-approval behavior. Missing public evidence may produce a narrowly framed, high-scoring experiment or an explicit escalation; inventing proof or silently ignoring the gap fails either way. Exact prose and volatile model identifiers are not graded.

## Run

Set a valid `OPENAI_API_KEY` in `.env.local`, then:

```bash
npm run eval:agent
```

For a one-case smoke:

```bash
npm run eval:agent -- --max-cases=1
```

The command writes `evals/results/latest.json` and exits non-zero if any case fails. The report stores model names, scores, checks, durations, and SHA-256 output digests; it does not store the API key or provider credentials.

Model outputs can vary. A failure is evidence to inspect, not permission to weaken the grader. Fix the prompt, evidence, schema, or model configuration and rerun the full matrix.
