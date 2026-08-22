---
name: game-animation
version: 0.1.0
owner: Shia App Factory
status: foundation
---

# Game Animation Skill

## Purpose

Create responsive, readable and characterful animation systems for gameplay, UI, props, vehicles, creatures and avatars in 2D, 2.5D, 3D and XR.

Invoke for locomotion, attacks, reactions, idles, emotes, transitions, procedural animation, rigging decisions, animation state machines, root motion, additive layers, camera animation, object motion, UI motion, or animation reviews.

## First principles

1. **Pose before polish.** If the key pose does not communicate the action, more in-betweens will not save it.
2. **Gameplay owns responsiveness.** Animation supports control; it must not make input feel late unless commitment is an intentional mechanic.
3. **Motion communicates intent.** Anticipation, direction, weight, speed and recovery should help the player predict what happens next.
4. **Animation is a state system, not a playlist.** Transitions, interruptions, blending and gameplay tags matter as much as clips.

## Required inputs

- character/object role
- player-controlled, AI, cinematic or ambient
- target camera and distance
- locomotion/control model
- gameplay states and interruption rules
- art style: realistic, stylized, pixel, limited animation, etc.
- rig/skeleton constraints
- engine/runtime
- target hardware and number of animated entities
- XR body/hand tracking requirements if applicable

## Animation construction model

For an authored action, reason in this order:

`intent -> key pose -> anticipation -> action/contact -> overshoot -> recovery -> return/branch`

Control:

- silhouette
- line of action
- center of mass
- arcs
- spacing and acceleration
- overlap/follow-through
- asymmetry
- secondary motion
- eye/head focus
- foot/hand contact
- recovery and interrupt windows

For stylized motion, exaggerate one or two readable variables rather than adding noise everywhere.

## Gameplay timing sheet

Every gameplay-critical animation should identify:

- input accepted
- anticipation begins
- gameplay event/contact frame
- cancel/interrupt windows
- invulnerability or vulnerability windows if any
- recovery begins
- control fully returns
- VFX/audio event frames

The gameplay event should be driven by one authoritative timeline or explicit event marker. Avoid visually showing a hit long before or after the gameplay registers it.

## State architecture

Separate:

- **base locomotion:** idle, walk, run, crouch, airborne
- **action layer:** attack, throw, interact, reload, use tool
- **reaction layer:** hit, stumble, celebration, fear
- **additive layer:** aim offset, breathing, recoil, look-at, hand IK
- **procedural corrections:** foot placement, slope alignment, hand targets
- **cinematic override:** authored sequences when gameplay control is intentionally suspended

Define transition ownership, priority and interruption rules explicitly. Avoid giant state machines with every combination encoded as a unique state when layering can express the same behavior.

## Root motion vs code-driven motion

Use root motion when exact authored displacement and contact are core to the action. Use code/physics-driven locomotion when responsiveness, network prediction or systemic movement is more important. Hybrid systems are often appropriate: code owns locomotion; root motion or motion warping owns special committed actions.

The choice must be documented per action family.

## Procedural animation

Use procedural layers to adapt authored animation to the world:

- foot IK / ground alignment
- aim/look-at
- hand placement
- suspension and wheel response
- recoil
- breathing
- leaning from velocity
- stride scaling
- object interaction targets
- XR hand/body tracking

Procedural motion should correct context, not erase the authored pose language.

## 2D and pixel animation

For low-resolution games:

- prioritize silhouette and timing over frame count
- use holds intentionally
- keep subpixel movement policy consistent
- avoid interpolation that destroys pixel clarity when crisp pixel motion is part of the style
- treat smear/stretch frames as designed symbols, not realistic geometry
- reuse motion cycles but vary timing/pose for personality

## XR/avatar considerations

Tracked motion changes the ownership model: some bones are device-driven, others are inferred or animated.

Define:

- tracked anchors: head, hands, controllers, optional body trackers
- inferred body chain
- IK limits
- collision/body proxy separate from visual avatar
- comfort constraints
- hand/controller fallback when full hand tracking is unavailable

Never assume every OpenXR runtime exposes identical hand/body tracking capabilities.

## Performance rules

Profile animated crowds and avatars on target hardware.

Watch:

- skinning cost and vertex count
- morph/blend shape count
- skeleton complexity
- animation update rate
- number of active AnimationTrees/graphs
- procedural IK cost
- offscreen animation
- network replication rate for multiplayer avatars

Use distance-based animation update reduction or pausing when the player cannot perceive full-rate motion.

## Engine adapters

### Godot

Primary tools: `AnimationPlayer` for authored clips/properties; `AnimationTree` for advanced transitions, blend trees, blend spaces, state machines and root motion. Godot can animate node/resource properties broadly, so keep animation ownership explicit to avoid hidden coupling.

### Unity

Primary tools: Animator/Mecanim, Animation Rigging, Timeline, Playables and procedural IK. Keep gameplay state separate from Animator parameters when a domain state model is clearer.

### Unreal Engine

Primary tools: Animation Blueprints, state machines, montages, Control Rig, IK Rig/Retargeter, Sequencer. Control Rig can be driven procedurally from gameplay/Animation Blueprints for contact and alignment adjustments.

## Deliverable format

1. animation intent and reference
2. state/layer diagram
3. timing/contact sheet
4. key-pose list
5. transition/interruption rules
6. procedural layer plan
7. engine implementation mapping
8. performance risks
9. test/capture plan

## Quality gate

- action reads in silhouette
- contact frame matches gameplay
- control latency is intentional and measured
- transition rules are deterministic
- feet/hands do not visibly slide in critical contacts without justification
- looping motion has no obvious pop
- different actions share a coherent pose language
- offscreen/distant animation has an optimization policy when scale requires it
- XR fallbacks exist for missing tracking capabilities
- VFX and audio markers are synchronized

## Evaluation prompts

A capable agent should be able to:

- build a locomotion + throw + hit-reaction layer plan
- diagnose why a character feels floaty despite high-quality mocap
- choose root motion vs code movement and justify the tradeoff
- design a Godot AnimationTree topology for a gameplay character
- adapt the same avatar from desktop controls to OpenXR tracked hands

## Provenance — foundation sources

- Godot animation introduction: https://docs.godotengine.org/en/4.5/tutorials/animation/introduction.html
- Godot AnimationTree: https://docs.godotengine.org/en/4.5/tutorials/animation/animation_tree.html
- Godot 3D performance / animation and skinning: https://docs.godotengine.org/en/latest/tutorials/performance/optimizing_3d_performance.html
- Unreal Control Rig: https://dev.epicgames.com/documentation/unreal-engine/rigging-with-control-rig-in-unreal-engine
- OpenXR / Godot XR overview: https://docs.godotengine.org/en/4.5/tutorials/xr/index.html

## Learning ledger

- 2026-08-19 — Foundation created. Future entries must include project, tested platform, observed result and whether the lesson generalized.
