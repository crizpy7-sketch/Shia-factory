# Factory Operating Templates

These templates are deliberately boring. They exist so task state, handoffs, review, and memory do not
live only in a model conversation.

## Project State Record

```yaml
project: ""
outcome: ""
current_state: backlog # backlog|ready|running|blocked|review|done|cancelled
active_task: null
exact_next_action: ""
blockers: []
recent_decisions: []
recent_lessons: []
evidence: []
last_reviewed: ""
next_review: ""
```

## Task Contract

```yaml
id: TASK-000
project_id: ""
outcome: ""
objective: ""
risk_tier: T2
dependencies: []
allowed_paths: []
read_only_paths: []
forbidden_paths: []
allowed_tools: []
forbidden_tools: []
acceptance_criteria:
  - id: AC-1
    statement: ""
    evidence_required: [test]
required_evidence: [test, runtime]
max_repair_attempts: 2
max_cost_usd: null
escalation_conditions: []
reviewer_required: false
human_approval_required: false
```

## Read-only Reconnaissance Packet

```yaml
problem: ""
observed_facts: []
unknowns: []
assumptions: []
relevant_files_or_systems: []
most_likely_explanation: ""
alternative_explanation: ""
evidence: []
recommended_next_action: ""
confidence: low # low|medium|high
research_disposition: TEST # ADOPT|TEST|REJECT|DEFER
```

## Context Packet

```yaml
project: ""
customer_outcome: ""
task: ""
relevant_specifications: []
relevant_decisions: []
relevant_procedural_lessons: []
expected_files: []
allowed_tools: []
forbidden_changes: []
success_tests: []
definition_of_done: []
context_budget:
  max_core_rules: 8
  max_task_lessons: 12
  broad_history: false
```

## Evidence Packet

```yaml
feature: ""
specification_version: ""
builder: ""
files_changed: []
contracts_used: []
tests: []
integration_results: []
browser_or_runtime_verification: []
performance_metrics: []
security_results: []
known_limitations: []
repair_attempts: 0
cost_usd: 0
reviewer: null
approval_status: pending
review_date: ""
```

## Exact-Candidate Receipt

```yaml
task_id: ""
base_candidate: ""
candidate: ""
changed_paths: []
risk_tier: T0
evidence: []
reviewed_by: null
reviewer_approved: false
human_approved: false
authorized_at: null
```

A materially different `candidate` requires a new receipt/review.

## Agent Scorecard

```yaml
task: ""
project: ""
agent: ""
model: ""
role: ""
difficulty: 1
risk: 1
task_completed: false
first_pass_success: false
tests: unknown
browser_or_runtime_verification: unknown
reviewer: unknown
repair_loops: 0
unnecessary_files_changed: []
human_intervention_minutes: 0
input_tokens: 0
output_tokens: 0
total_ai_cost_usd: 0
total_elapsed_minutes: 0
final_result: rejected # accepted|rejected|escalated
failure_reason: null
lesson: null
use_again_for_task_type: null
```

Primary routing metric: **cost per accepted task**. Also track human attention and completion latency.

## Architecture Decision Record

```yaml
id: ADR-000
title: ""
status: proposed # proposed|accepted|superseded|rejected
context: ""
decision: ""
alternatives: []
tradeoffs: []
evidence: []
supersedes: null
review_date: ""
```

## Memory Candidate

```yaml
content: ""
epistemic_state: observed # observed|inferred|assumed|decided|proven|stale|conflicting
provenance: ""
verified: false
support_count: 0
authority: candidate # candidate|authoritative
project_scope: []
applies_when: []
does_not_apply_when: []
last_verified: null
```

An agent may propose memory. Promotion to authority follows policy; shared retrieval does not grant
shared mutation rights.

## Requirement Traceability Record

```yaml
requirement_id: REQ-001
requirement: ""
task_id: TASK-001
implementation_paths: []
verification: []
evidence: []
status: not_done # not_done|partial|verified
```

## Harness Friction Record

```yaml
task: ""
result: fail # pass|fail
friction: ""
category: context # model|specification|context|tool|environment|test|permission|process
could_recur: true
proposed_harness_change: ""
status: backlog # backlog|implemented|rejected
```

Repeated friction should become a durable improvement rather than a larger future prompt.

## Marketing Experiment Record

```yaml
hypothesis: ""
audience: ""
desired_outcome: ""
offer: ""
mechanism: ""
proof: []
creative: ""
channel: ""
start_date: ""
spend: 0
metrics: {}
result: ""
lesson: ""
next_test: ""
```

Important marketing claims should link to evidence. AI creative volume is downstream from measured
customer truth.
