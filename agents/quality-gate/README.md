# Permanent Quality Gate

Quality Gate is an operational, callable bootstrap adapter over the existing BORIS tests, agent tests, CI, advisory review and GStack review/QA/CSO references. It requires a task contract, risk tier, exact candidate, acceptance criteria and required-evidence specification. Missing context returns a machine-readable evidence gap before routing.

It cannot certify its own bootstrap implementation or approve a candidate that changes itself. Cristian approved the exact Phase 4 bootstrap in merged PR #13 (`d2f87e3a3a2b66394e3ff290ad5dda35b95483aa`). That repository-governance approval is not a claim of independent Quality Gate certification.

Full Phase 5 evidence packets and browser, visual, accessibility, security and performance gate implementations are intentionally not part of Phase 4.
