# Skill: Factory Learning Loop

## Purpose

Use this skill after meaningful work completes or fails. Its job is to convert verified experience into better future execution without allowing workers to self-authorize governance changes.

## Core loop

```text
experience
→ classify observation
→ attach provenance
→ verify evidence
→ extract candidate lesson
→ check duplicates/conflicts
→ assign confidence/support
→ promote only when justified
→ retrieve selectively on future tasks
→ measure whether the lesson helped
```

## Epistemic states

Keep these states distinct:

- observed — directly seen in logs/tests/runtime/customer behavior
- inferred — supported explanation, not directly proven
- assumed — unverified working assumption
- decided — intentional authoritative choice
- proven — repeatedly or deterministically verified knowledge
- stale — once useful but no longer current
- conflicting — disagrees with another authoritative source

An inference or assumption must never silently become an authoritative fact.

## Memory types

Route information by type:

- working — temporary task context
- episodic — what happened in a specific run/session
- semantic — durable fact/decision
- procedural — how to reliably perform a repeatable task

Do not store every transcript as durable memory.

## Promotion rules

A single trajectory normally creates a candidate lesson, not a permanent rule.

Promote when one or more applies:

- deterministic evidence proves the rule
- repeated independent runs support the same lesson
- an authoritative human/ADR explicitly decides it
- the lesson has a stable scope and a testable success condition

Preserve provenance, source task, date, support count, confidence, applicability, and supersession history.

## Memory budget

Store broadly; retrieve narrowly.

Context packets should select memory according to:

- project
- task type
- risk
- recency
- confidence
- provenance
- support count
- model capability
- context budget

Smaller/local workers usually receive a compact core plus a few highly relevant lessons. Frontier reviewers may receive a broader relevant history when the decision warrants it.

## Harness refinement

When friction repeats, ask what the environment is missing.

Classify the failure:

- specification
- context
- repository legibility
- tool
- permission
- test/verifier
- runtime/environment
- skill/procedure
- memory
- model

Prefer the smallest durable correction:

```text
memory
→ instruction
→ check
→ automated gate
→ invalid state impossible
```

Examples:

- repeated wrong command → update AGENTS.md/runbook
- repeated missed bug → add regression test
- repeated procedure → promote to Skill
- repeated forbidden edit → enforce path/capability boundary
- repeated context bloat → improve retrieval/context compiler

## Self-improvement boundary

Workers may propose changes to:

- skills
- procedural memory
- prompts/instructions
- subagent configurations
- test templates
- runbooks

Workers may NOT self-authorize changes to:

- FACTORY_CONSTITUTION.md
- permission policy
- acceptance policy
- risk policy
- human-approval requirements
- secret/access controls
- evaluator authority
- memory-promotion authority

Those are governance/harness-control changes and require elevated independent review.

## Verified trajectories

Only verified trajectories become reusable learning material.

A trajectory eligible for promotion should include:

- task/spec reference
- candidate identity
- attempts/failures
- decisive diagnosis
- accepted fix or outcome
- verifier evidence
- reviewer result where required
- provenance

Never teach future workers from a run that merely claimed success.

## Repository gardening

Recurring unattended maintenance should prefer boring, bounded wins:

- stale docs
- duplicate helper
- dead code
- unused dependency
- small naming inconsistency
- missing low-risk regression coverage

Explicitly refuse broad refactors, auth/security changes, architecture migrations, permission changes, or Factory Constitution changes without a separate authorized task.

## Skill supply-chain rule

Third-party skills are executable supply-chain artifacts. Before adoption check:

- source and license
- requested permissions
- network/filesystem behavior
- secrets exposure
- sandbox results
- overlap with existing skills
- measurable benefit

New or interesting does not equal trusted.

## Done

The learning loop is complete when a verified experience either:

1. produces a scoped candidate memory/skill/harness change with provenance and review state, or
2. is deliberately rejected/deferred with the reason recorded.
