# Shia Skill Expertise Protocol v0.1

A model or agent does not become an expert because a skill file says “expert.” Expertise is a measured status earned against versioned evaluations and real production evidence.

## Separation

- **Agent identity** answers: who is this agent, what authority does it have, how does it behave?
- **Skill** answers: what reusable procedure/judgment can it apply?
- **Host/model** answers: what engine is currently performing the reasoning?
- **Certification** answers: has this specific host + agent + skill combination demonstrated the required capability?

Never collapse these into one prompt.

## Competency ladder

### L0 — Untrained

Has no loaded skill or has not demonstrated it.

### L1 — Familiar

Can explain terminology and reproduce a basic procedure with references.

### L2 — Practitioner

Can complete bounded tasks, follow quality gates and detect common failure modes.

### L3 — Specialist

Can diagnose ambiguous problems, choose between techniques, defend tradeoffs, profile/measure outcomes and adapt across multiple projects.

### L4 — Expert

Consistently produces high-quality outcomes across unseen problems, catches second-order failures, teaches/updates the skill from evidence, and remains calibrated about uncertainty.

No L4 certification from self-description alone.

## Evaluation families

Each skill should accumulate tests in five categories:

1. **Knowledge** — current concepts, APIs, constraints.
2. **Diagnosis** — identify why a visual/system result is weak or expensive.
3. **Design** — produce a coherent plan under real constraints.
4. **Implementation review** — inspect actual code/assets/settings and find defects.
5. **Outcome** — compare captures, profiling data or playtest evidence against acceptance criteria.

## Eval record schema

Record:

- skill + version
- agent identity + version
- host/model/toolchain
- date
- project and commit/artifact reference
- task prompt
- expected rubric
- observed output
- measured result
- pass/fail and score
- reviewer
- failure notes
- lesson proposed for the skill ledger

## Certification rules

- Certification applies to a specific skill version and runtime combination.
- Updating the skill can require targeted recertification.
- A new host/model starts uncertified even if another host was certified.
- Real project evidence is stronger than synthetic question answering.
- One spectacular demo does not establish general expertise.
- Repeated silent failures lower certification confidence.

## Game visual specialist target

To certify an eventual Shia Game Visual Specialist at L3, require at minimum:

- one VFX redesign with before/after capture and target-device profile
- one animation-system design with explicit timing/transition tests
- one complete scene graphics/art-direction audit
- one performance optimization task with measured improvement
- one cross-engine translation exercise
- one failure diagnosis where the first proposed solution is intentionally misleading

For L4, add multiple shipped/accepted project outcomes and evidence that the agent improved the skill library without degrading prior evals.

## Learning loop

`task -> evidence -> review -> lesson -> skill patch -> regression eval -> version`

Production lessons should be written as narrow evidence-backed updates, not broad folklore.
