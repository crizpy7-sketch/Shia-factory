# Permanent Quality Gate

Quality Gate is an operational permanent role backed by the approved Phase 5 receipt engine at `boris/src/quality/quality-gate.ts`. It consumes existing BORIS tests, agent tests, CI, advisory review and GStack review/QA/CSO evidence. It requires task/project/repository identity, exact candidate, task contract, risk tier, acceptance criteria, required and actual evidence, changed paths, change signals, and repair budget. Missing context returns a machine-readable evidence gap before evaluation.

It cannot certify its own implementation or approve a candidate that changes itself. Cristian approved the trusted Phase 5 implementation in merged PR #14 (`d2b1baa2005c10ac1b2c25a26a8c705acc6c444e`). A passing receipt is evidence for Shia Core; it never grants action authority or independently marks a Shia task accepted.

Browser, visual, accessibility, security and performance results must cross the trusted evidence-admission boundary before evaluation. Raw worker, CI, browser, BORIS or GStack claims remain audit-only until an authorized adapter verifies their provenance. Admitted records are canonical-copied and immutable, so callers cannot alter a verified SHA, status or approval binding after admission. Unavailable tooling or artifacts produce `needs-evidence`, not a fabricated pass.
