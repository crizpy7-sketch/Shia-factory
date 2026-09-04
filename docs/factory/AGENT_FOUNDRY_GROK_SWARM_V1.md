# Agent Foundry — Grok Swarm v1

Status: feature-branch design only. No production deployment.

## Purpose

Use Grok instances as independent architects/critics during development while Shia Factory owns the resulting agent specification, evaluation suite, workflow, memory contract, tool contract, and provider-neutral runtime definition.

The swarm performs behavioral synthesis only. It must not attempt to recover hidden system prompts, private chain-of-thought, model weights, proprietary internals, or bulk-distill/scrape another model's outputs.

## Roles

### G1 — Capability Architect

Owns:
- mission decomposition
- behavioral requirements
- capability map
- tool requirements
- memory requirements
- workflow steps
- output contract

Produces: `candidate-g1.json`

### G2 — Systems Architect

Owns:
- provider-neutral runtime design
- local-model portability
- adapter boundaries
- state/memory separation
- tool permission boundaries
- failure recovery
- observability/provenance

Produces: `candidate-g2.json`

### G3 — Evaluation + Red Team Architect

Owns:
- eval cases
- adversarial cases
- failure modes
- hallucination resistance
- tool misuse resistance
- acceptance thresholds
- regression criteria

Produces: `candidate-g3.json`

### G4 — Compiler / Judge

Inputs:
- original user behavior specification
- candidate-g1.json
- candidate-g2.json
- candidate-g3.json

Owns:
- compare candidates
- identify conflicts and omissions
- select strongest candidate
- synthesize one improved provider-neutral blueprint
- preserve provenance and explicit limitations

Produces:
- `judgement.json`
- `compiled-agent-blueprint.json`

### Builder Grok — Implementation Worker

Runs only after G4 has produced a compiled blueprint.

Owns:
- implement the approved blueprint against the Shia Factory feature branch
- add/update tests
- avoid changing canonical permanent workforce roles unless explicitly required and approved
- do not deploy
- do not merge

Produces:
- code changes on `feature/agent-foundry-v1`
- test evidence
- implementation notes

## Shared Candidate Output Contract

Every architect candidate returns JSON only:

```json
{
  "name": "string",
  "mission": "string",
  "principles": ["string"],
  "capabilities": ["string"],
  "tools": ["string"],
  "memory": {
    "persistent": ["string"],
    "taskScoped": ["string"]
  },
  "workflow": ["string"],
  "outputContract": ["string"],
  "guardrails": ["string"],
  "evals": [
    {
      "id": "string",
      "description": "string",
      "passCondition": "string"
    }
  ],
  "knownLimitations": ["string"],
  "openQuestions": ["string"]
}
```

## Shared Source Packet

Before running the swarm, create one source packet containing only material the user is entitled to provide:

- target agent name
- desired mission
- desired capabilities
- allowed tools
- desired memory behavior
- desired output style/format
- user-supplied examples of good behavior
- explicit constraints
- known failure modes to avoid
- deployment target (cloud/local/VPS)

Do not include requests to reveal or reconstruct hidden prompts, chain-of-thought, weights, or proprietary internals.

## Execution Order

1. Freeze one source packet.
2. Run G1, G2, and G3 independently from the same source packet.
3. Do not let G1/G2/G3 see each other's answers.
4. Feed all three outputs plus the original source packet to G4.
5. G4 emits the compiled blueprint and judgement.
6. Run the compiled blueprint through Shia Factory evals/Quality Gate.
7. Only after the blueprint passes, hand it to Builder Grok for implementation.
8. Keep implementation on `feature/agent-foundry-v1`; no production deployment or merge without explicit approval.

## Stop Conditions

Stop and return `NEEDS_INPUT` if:
- the target behavior is underspecified
- requested tools are unknown
- memory persistence requirements are ambiguous
- the source packet asks for proprietary prompt/weight extraction
- candidates disagree on a safety-critical or permission-critical capability

Stop and return `REJECTED` if:
- the request depends on recovering hidden prompts, private chain-of-thought, model weights, or proprietary internals
- the workflow requires bulk scraping/distillation of another model's outputs
