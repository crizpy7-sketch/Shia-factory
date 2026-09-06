---
name: game-vfx
version: 0.1.0
owner: Shia App Factory
status: foundation
---

# Game VFX Skill

## Purpose

Design real-time visual effects that make gameplay clearer, more satisfying and more memorable while staying inside the target platform's frame-time and memory budgets.

Invoke for particles, hits, explosions, dust, sparks, magic, trails, weather, impacts, pickups, combo feedback, environmental ambience, screen-space effects, camera reactions, juice/game-feel passes, VFX optimization, or VFX reviews.

## First principle

**Gameplay readability beats spectacle.** An effect must tell the player what happened, where it happened, how important it was, and what they should do next before it tries to look impressive.

## Required inputs

Before production, resolve as many of these as the project provides:

- gameplay event and player meaning
- camera distance / perspective
- 2D, 2.5D, 3D, desktop, mobile, web or XR target
- art direction and palette
- desired emotional beat
- effect lifetime and frequency
- maximum simultaneous instances
- target frame rate and hardware tier
- engine and renderer
- whether the effect affects gameplay or is presentation-only

If inputs are missing, choose conservative defaults and label them as assumptions.

## Effect anatomy

Build effects as a timed stack, not one emitter:

1. **Anticipation** — telegraph danger, charge, direction or timing.
2. **Primary event** — the unmistakable main shape at the exact gameplay frame.
3. **Secondary motion** — sparks, fragments, paper, droplets, smoke, dust, ribbons.
4. **Environmental response** — decal, light flash, shadow, surface splash, foliage reaction.
5. **Camera/UI response** — shake, hit-stop, vignette, chromatic/distortion only when justified.
6. **Dissipation** — shrinking, cooling, fading, settling, gravity, drag.
7. **Residue** — scorch, footprint, smoke wisp, debris or persistent state when useful.

The primary gameplay event and the visual event must share the same timing source. Never make the player wait for an animation or particle to decide when gameplay happened unless gameplay explicitly depends on that simulation.

## Readability model

For each effect, deliberately control:

- **silhouette:** can the main event be read in one frame?
- **value:** is the important part brighter/darker than its background?
- **color:** reserve the strongest accent for highest gameplay importance.
- **direction:** velocity, streaks and debris should explain force direction.
- **scale:** larger should usually mean more important, dangerous or powerful.
- **timing:** fast attack, readable hold, clean release; avoid equal timing everywhere.
- **density:** cluster detail around the event; leave visual breathing room elsewhere.
- **randomness:** randomize secondary detail, not the core message.
- **depth:** use foreground/background separation without hiding targets or UI.

## Motion recipe

Use this default sequence for satisfying impacts:

`anticipate -> accelerate -> contact -> 1-3 frame punch -> overshoot -> settle`

Useful layers include:

- mesh/sprite burst
- trail or ribbon
- small high-speed particles
- larger slow debris
- short-lived emissive/light pulse
- decal or surface response
- local camera impulse
- optional hit-stop / time dilation
- audio event synchronized to contact

Avoid stacking every layer on every event. Build importance tiers: ambient, routine, strong, critical/boss.

## Performance rules

Profile on target hardware. Do not optimize from particle count alone.

Watch:

- transparent overdraw / fill rate
- large full-screen alpha quads
- particle material and shader complexity
- texture reads
- dynamic lights and shadows
- collision-heavy particles
- emitter update frequency
- visibility bounds
- simultaneous effects
- unique materials/shaders that block batching or increase state changes
- shader compilation stutter

Prefer:

- shared materials/shaders
- atlases/flipbooks where appropriate
- GPU particles for large simple simulations when supported
- fixed/update rates below display rate with interpolation when visually acceptable
- LOD or visibility-based effect reduction
- alpha cutout/opaque geometry when it communicates the same look more cheaply
- pooled/reused effect instances when lifecycle churn is measurable
- prebaked flipbooks for effects whose simulation does not need to remain live

## Engine adapters

### Godot

Primary tools: `GPUParticles2D/3D`, `ParticleProcessMaterial`, particle shaders, subemitters, trails, collision/attractors, spatial/canvas shaders, `WorldEnvironment`, post-processing, AnimationPlayer/Tween for authored timing.

Important current constraints to verify before shipping:

- GPU particle feature support varies by rendering method.
- transparency is expensive and reduces batching opportunities.
- particle amount, collision, preprocess and visibility AABB directly affect cost.
- reuse materials and shaders where possible.

### Unity

Primary tools: Visual Effect Graph, Particle System, Shader Graph, Timeline/Animation events, URP/HDRP post-processing. Verify current URP/mobile support for VFX Graph before choosing it as a project requirement.

### Unreal Engine

Primary tools: Niagara systems/emitters/modules/parameters, material editor, decals, camera shakes, post-process materials, Sequencer for authored sequences. Use Niagara templates/modules first; custom modules when a reusable behavior justifies them.

## Deliverable format

A VFX design/review should output:

1. gameplay purpose
2. effect timing sheet
3. layer stack
4. palette/value plan
5. implementation path for the active engine
6. performance risks and fallback tier
7. acceptance criteria
8. capture/playtest plan

## Quality gate

Do not mark complete until:

- event is readable without audio
- contact frame matches gameplay
- no critical target/UI is obscured
- effect communicates direction and magnitude
- effect has a beginning, peak and ending
- multiple simultaneous instances remain readable
- target hardware is profiled
- low/medium/high quality tiers exist when project scale warrants them
- screenshot/video comparison exists before vs after
- no effect is added solely because it looks cool if it harms gameplay clarity

## Evaluation prompts

A capable agent should be able to:

- redesign a weak hit effect into a layered timing plan
- diagnose overdraw-heavy smoke and propose cheaper alternatives
- distinguish gameplay telegraph VFX from reward VFX
- create a Godot implementation map using GPU particles, shaders and post effects
- audit a scene and rank VFX by gameplay importance and performance risk

## Provenance — foundation sources

Primary references reviewed for v0.1:

- Godot 4.5 GPUParticles3D: https://docs.godotengine.org/en/4.5/classes/class_gpuparticles3d.html
- Godot particle shaders: https://docs.godotengine.org/en/4.5/tutorials/shaders/shader_reference/particle_shader.html
- Godot 3D particle properties: https://docs.godotengine.org/en/stable/tutorials/3d/particles/properties.html
- Godot GPU/3D optimization: https://docs.godotengine.org/en/latest/tutorials/performance/gpu_optimization.html and https://docs.godotengine.org/en/latest/tutorials/performance/optimizing_3d_performance.html
- Unity 6 Visual Effect Graph: https://docs.unity3d.com/current/Manual/com.unity.visualeffectgraph.html
- Unreal Niagara: https://dev.epicgames.com/documentation/unreal-engine/overview-of-niagara-effects-for-unreal-engine

## Learning ledger

Append measured project lessons below rather than silently changing the core rules.

- 2026-08-19 — Foundation created from primary engine documentation. No Shia production benchmarks recorded yet.
