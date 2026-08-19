# Shia App Factory — reusable skill library

Skills are versioned procedures and judgment, separate from named agent identity. A skill can be loaded by Boris, Gary, a future game-art specialist, Codex, Claude Code, or another host without changing the identity package of the agent using it.

## Contract

- `skills/<skill-id>/SKILL.md` is the canonical portable skill.
- A skill states when to invoke it, inputs, workflow, deliverables, quality gates, failure modes, and source provenance.
- Skills are engine-aware but should preserve engine-neutral reasoning whenever possible.
- Engine/tool facts that may change must be verified against current primary documentation before implementation.
- Every completed production task should feed new evidence back into the skill: successful patterns, measured budgets, failed approaches, and evaluation examples.
- Skills do not grant authority. Agent authority remains in `agents/registry.js` and the agent package.

## Foundation skills

| Skill | Purpose |
| --- | --- |
| `game-vfx` | Design readable, performant real-time effects and game-feel feedback. |
| `game-animation` | Build expressive, responsive 2D/3D character and object animation systems. |
| `game-graphics` | Establish art direction, lighting, materials, camera, rendering budgets and visual QA. |
| `virtual-world` | Design the persistent spatial layer that can host games, agents, avatars and shared spaces across desktop and XR. |

## Skillification loop

`Research -> Model -> Build -> Measure -> Critique -> Fix -> Capture -> Version -> Re-evaluate`

A skill is not considered expert because it contains a long prompt. Expertise is earned by accumulating evaluated examples and measured production outcomes.
