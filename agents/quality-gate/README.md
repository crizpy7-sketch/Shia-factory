# Permanent Quality Gate

Quality Gate is an operational permanent role backed by the Phase 5 candidate receipt engine at `boris/src/quality/quality-gate.ts`. It consumes existing BORIS tests, agent tests, CI, advisory review and GStack review/QA/CSO evidence. It requires task/project/repository identity, exact candidate, task contract, risk tier, acceptance criteria, required and actual evidence, changed paths, change signals, and repair budget. Missing context returns a machine-readable evidence gap before evaluation.

It cannot certify its own implementation or approve a candidate that changes itself. Cristian approved the exact Phase 4 bootstrap in merged PR #13 (`d2f87e3a3a2b66394e3ff290ad5dda35b95483aa`). The Phase 5 candidate still requires Cristian's approval before merge. A passing receipt is evidence for Shia Core; it never grants action authority or independently marks a Shia task accepted.

Browser, visual, accessibility, security and performance results must be supplied as retained exact-candidate evidence. Unavailable tooling or artifacts produce `needs-evidence`, not a fabricated pass.
