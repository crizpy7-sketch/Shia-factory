---
name: game-graphics
version: 0.1.0
owner: Shia App Factory
status: foundation
---

# Game Graphics Skill

## Purpose

Design and review the complete real-time visual system of a game or spatial experience: art direction, shape language, composition, materials, lighting, camera, environment, post-processing, asset budgets and rendering quality tiers.

Invoke for art direction, visual redesigns, environment art, lighting, shaders/materials, rendering pipelines, graphics settings, visual consistency, asset optimization, camera presentation, or visual QA.

## First principle

**A beautiful game is a coordinated visual system, not a collection of expensive assets.** Consistency, hierarchy and readability normally create more perceived quality than raw polygon count or shader complexity.

## Visual hierarchy

Establish these before asset production:

1. **Player focus** — what must be seen first?
2. **Gameplay layer** — targets, hazards, interactables, navigation.
3. **Character layer** — silhouettes, factions, state readability.
4. **Environment layer** — world identity and spatial orientation.
5. **Atmosphere layer** — fog, weather, particles, grading, ambience.
6. **UI layer** — must remain legible against every gameplay composition.

The environment should frame gameplay, not compete with it.

## Art-direction bible

Every project should define:

- visual thesis in one sentence
- reference board and anti-reference board
- shape language
- palette and value structure
- material language
- edge/detail density rules
- character proportion rules
- lighting philosophy
- camera/lens rules
- VFX accent colors
- UI relationship to world
- acceptable realism/stylization level
- quality targets by platform

For stylized work, define what is intentionally inaccurate. Stylization is a rule set, not missing realism.

## Materials and PBR

For physically based 3D workflows, keep material authoring internally consistent. Use a small material vocabulary before creating many unique materials.

Track at minimum:

- base color/albedo
- metallic behavior
- roughness
- normal detail
- emissive
- opacity mode only when needed

Use measured/credible relationships even in stylized PBR, then bend them consistently. Avoid making every surface glossy, noisy, emissive or uniquely textured.

## Lighting model

Build lighting in layers:

1. key / dominant source
2. fill / ambient environment
3. gameplay accents
4. local practical lights
5. atmosphere / fog / volumetrics
6. emissive/VFX contributions

Judge lighting in grayscale as well as color. The player, hazards and route should remain readable under the darkest expected condition.

Dynamic lighting, shadows and GI can dominate cost. Choose static/baked, mixed or fully dynamic lighting based on gameplay need and target hardware rather than prestige.

## Camera and composition

Define:

- camera height and angle
- field of view / equivalent lens intent
- follow/lead behavior
- dead zones
- look-ahead
- collision handling
- shake intensity tiers
- motion blur policy
- exposure behavior
- gameplay-safe framing

A camera is part of game design. Changes to FOV, shake and post effects alter perceived speed, scale, difficulty and comfort.

## Asset pipeline

Use a source-of-truth pipeline:

`reference -> source asset -> validated intermediate -> engine import -> runtime asset -> LOD/quality variants -> capture test`

For portable 3D:

- use OpenUSD where scene composition, collaboration and rich authoring are valuable
- use glTF/GLB as a strong runtime delivery/interchange target
- use KTX2/Basis Universal where cross-platform GPU texture distribution benefits the project

Do not confuse authoring and runtime formats. Preserve source assets separately from optimized shipping assets.

## Performance model

The correct question is not “how many polygons?” but “what consumes frame time, bandwidth and memory on the target device?”

Profile:

- draw calls / state changes
- material count
- shader complexity
- transparent overdraw
- texture resolution and memory
- texture reads
- dynamic lights/shadows
- GI/reflections
- geometry/vertex cost
- skinning/morphs
- particles
- post-processing
- culling efficiency
- scene streaming
- CPU submission and GPU time

Use:

- mesh LOD/HLOD
- visibility ranges
- occlusion/frustum culling
- instancing/MultiMesh-equivalents
- material/shader reuse
- atlases where appropriate
- baked lighting on lower-power tiers
- compressed textures
- distance-based effects
- quality presets based on actual target hardware

Transparent surfaces deserve special scrutiny because back-to-front blending and overdraw can become fill-rate bottlenecks.

## Visual QA loop

For every major visual change:

1. capture fixed reference views
2. compare against visual thesis
3. inspect grayscale hierarchy
4. inspect silhouette/readability
5. inspect motion, not just stills
6. profile target hardware
7. test worst-case simultaneous effects
8. verify mobile/XR/low-quality fallback if supported
9. record before/after evidence

## Engine adapters

### Godot

Primary systems: `WorldEnvironment`, Forward+/Mobile/Compatibility renderers, StandardMaterial3D/ORMMaterial3D, spatial shaders, decals, fog, screen-space effects, reflection probes, lightmaps, LOD/visibility ranges, MultiMesh, shader baker.

### Unity

Primary systems: URP/HDRP, Shader Graph, Volume framework/post-processing, LOD Groups, GPU instancing/SRP Batcher, lightmapping and platform quality settings. Verify current pipeline-specific feature support before choosing an effect.

### Unreal Engine

Primary systems: Materials, Lumen, Nanite, Virtual Shadow Maps, post process, Niagara, World Partition/HLOD, profiling tools. Do not enable high-end systems simply because they exist; validate their cost and platform support.

## Deliverable format

1. visual thesis
2. art bible decisions
3. scene hierarchy/readability plan
4. lighting/material/camera plan
5. asset pipeline
6. target-platform graphics tiers
7. performance budget/risk register
8. fixed capture shots
9. acceptance criteria

## Quality gate

- scene has an obvious focal hierarchy
- gameplay objects remain readable in motion
- palette/material language is consistent
- lighting supports navigation and mood simultaneously
- camera behavior is intentional
- no major shader/post effect exists without a gameplay or art-direction purpose
- target hardware is profiled
- portable source assets are preserved
- runtime assets are validated and optimized
- quality degradation is graceful rather than random

## Evaluation prompts

A capable agent should be able to:

- turn a visually inconsistent prototype into a coherent art bible
- explain why a scene looks expensive but not professional
- diagnose material/lighting hierarchy problems
- build platform graphics tiers for desktop, mobile and XR
- choose where OpenUSD, glTF and KTX2 belong in the same pipeline

## Provenance — foundation sources

- Godot environment/post-processing: https://docs.godotengine.org/en/4.5/tutorials/3d/environment_and_post_processing.html
- Godot spatial shaders: https://docs.godotengine.org/en/4.5/tutorials/shaders/shader_reference/spatial_shader.html
- Godot GPU optimization: https://docs.godotengine.org/en/latest/tutorials/performance/gpu_optimization.html
- Godot 3D optimization: https://docs.godotengine.org/en/latest/tutorials/performance/optimizing_3d_performance.html
- Unreal performance profiling: https://dev.epicgames.com/documentation/unreal-engine/introduction-to-performance-profiling-and-configuration-in-unreal-engine
- glTF 2.0: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
- KTX 2.0: https://registry.khronos.org/KTX/specs/2.0/ktxspec.v2.html
- OpenUSD: https://openusd.org/

## Learning ledger

- 2026-08-19 — Foundation created. No Shia-specific frame-time, memory or asset-budget benchmarks recorded yet.
