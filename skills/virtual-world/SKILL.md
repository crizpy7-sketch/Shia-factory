---
name: virtual-world
version: 0.1.0
owner: Shia App Factory
status: foundation
---

# Virtual World Skill

## Purpose

Design persistent spatial software where users, agents, games, tools, assets and social spaces can coexist across desktop, mobile and XR without binding the system to one headset or one game engine.

Invoke for virtual headquarters, agent avatars, persistent worlds, game portals, multiplayer spaces, XR/VR/MR, spatial UI, identity/avatar portability, shared scene architecture, world streaming, or migration from screen-based 3D to immersive XR.

## Core architecture rule

**The world is a presentation/runtime layer over durable identity, state, skills and content — not the database and not the brain.**

A user should be able to lose or replace the renderer, headset, model host or engine without losing their identity, projects, agent memories, permissions or owned assets.

## Layers

Treat the system as separate layers:

1. **Identity layer** — users, agents, roles, ownership, permissions.
2. **Knowledge/skill layer** — portable agent skills, memory, provenance, evaluations.
3. **World-state layer** — rooms, positions, objects, inventories, project state, events.
4. **Simulation layer** — game logic, physics, NPC/agent behaviors, rules.
5. **Asset layer** — meshes, rigs, animation, materials, audio, VFX, metadata.
6. **Networking layer** — authority, replication, persistence, matchmaking/presence.
7. **Presentation layer** — 2D web, 3D desktop, mobile, VR, AR/MR.
8. **Device layer** — keyboard/mouse, gamepad, touch, tracked controllers, hands/body.

Do not collapse these layers into one engine-specific scene file.

## Open portability spine

Prefer open standards at boundaries where practical:

- **OpenXR** for cross-platform XR runtime/device interaction.
- **OpenUSD** for rich scene composition, collaborative authoring and large scene graphs.
- **glTF/GLB** for efficient runtime 3D asset delivery/interchange.
- **KTX2/Basis Universal** for portable compressed GPU textures.

These are complementary, not competitors: author richly, package efficiently, run across device classes.

## World object contract

Every persistent object should have an engine-neutral identity and metadata independent of its rendered instance.

Minimum conceptual schema:

- stable object ID
- object type
- owner/authority
- transform or logical location
- state payload
- asset reference/version
- interaction capabilities
- persistence policy
- replication policy
- permissions
- provenance/source

The engine scene is a projection of this state.

## Agent embodiment

An agent avatar has at least three separate identities:

- **cognitive identity** — portable named-agent package and skills
- **world identity** — permissions, presence, location, task state
- **visual embodiment** — avatar mesh/sprite, animations, voice, expressions

Never store the agent's durable memory only inside the avatar or game scene.

Useful embodied states:

- idle
- listening
- thinking/planning
- working
- blocked/waiting on input
- reviewing
- presenting
- collaborating with another agent
- error/recovery

The visual state should reflect real runtime state rather than fake “alive” animation.

## Games as realms/portals

Design games so they can eventually become **realms inside the larger world**:

- the world shell owns identity, social presence and navigation
- a game realm owns its gameplay simulation and rules
- crossing a portal starts/joins that realm
- achievements/rewards can return to the persistent profile through explicit contracts
- a realm may use a different engine or runtime if boundaries remain stable

Do not require every game to become one giant monolithic world process.

## Spatial interaction rules

For XR/spatial interfaces:

- preserve comfortable scale and reach
- keep critical UI stable and legible
- avoid forcing precise mid-air interaction for tasks better suited to panels/controllers
- support seated/standing and room-scale policies explicitly
- treat locomotion/turning comfort as user-selectable
- provide controller fallback when hand tracking is unavailable or unreliable
- design interaction through semantic actions rather than device-specific button names

OpenXR action mappings should sit behind domain actions such as `select`, `grab`, `teleport`, `menu`, `use-tool`.

## Simulation authority

For shared worlds, define authority before multiplayer implementation:

- local cosmetic effects: client authority acceptable
- persistent world state: authoritative service/server
- competitive gameplay: server-authoritative where cheating/desync matters
- agent actions: require capability/permission checks before world mutation
- expensive AI reasoning: asynchronous service call with explicit world-state transaction boundaries

The renderer should never be trusted as the sole authoritative record of important state.

## Scale strategy

Use cells/rooms/realms rather than one continuously loaded universe.

Plan for:

- spatial partitioning
- on-demand asset loading
- object/entity relevance
- LOD/HLOD
- network interest management
- persistent but unloaded objects
- deterministic IDs and versioned schemas

A “persistent world” means state persists; it does not mean every object is simulated and rendered all the time.

## Godot-first adapter

Godot is a strong candidate for the first Shia spatial prototype because it supports normal desktop 3D and has first-party OpenXR documentation covering passthrough, room-scale, action maps, composition layers, hand tracking, body tracking and render models.

Recommended progression:

1. desktop 3D Factory scene
2. same scene with abstract input actions
3. avatar/agent embodiment driven by real runtime states
4. world-state separated from nodes/scenes
5. OpenXR test mode
6. controller interaction
7. optional hand tracking
8. multiplayer presence
9. game-realm portals

Do not start by requiring a headset.

## Deliverable format

1. world thesis and user job-to-be-done
2. layer diagram
3. identity/state/asset contracts
4. engine boundary
5. interaction action map
6. persistence/authority model
7. device compatibility plan
8. performance/streaming plan
9. staged migration roadmap
10. eval scenarios

## Quality gate

- durable state exists outside renderer/scene files
- engine/device can be replaced without identity loss
- agent cognition and avatar embodiment are separate
- actions are semantic, not hard-coded to one controller
- persistent objects have stable IDs and authority
- world can be partitioned/streamed
- XR is an additional presentation mode, not the sole product dependency
- multiplayer authority is explicit
- portable asset formats are part of the pipeline
- game realms can remain modular

## Evaluation prompts

A capable agent should be able to:

- turn a web-based agent dashboard into a staged spatial architecture without rewriting the backend
- explain which data belongs in world state versus an engine scene
- design a game portal that launches a separate gameplay realm while preserving player identity
- map desktop mouse/gamepad input and OpenXR controller/hand input onto the same semantic actions
- identify architecture that would trap Shia Factory inside one proprietary headset or engine

## Provenance — foundation sources

- OpenXR registry/specification: https://registry.khronos.org/OpenXR/
- Khronos OpenXR overview: https://www.khronos.org/openxr/
- Godot XR: https://docs.godotengine.org/en/4.5/tutorials/xr/index.html
- Godot OpenXR settings: https://docs.godotengine.org/en/stable/tutorials/xr/openxr_settings.html
- OpenUSD: https://openusd.org/
- glTF 2.0: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
- KTX2: https://registry.khronos.org/KTX/specs/2.0/ktxspec.v2.html

## Learning ledger

- 2026-08-19 — Foundation created. The first required production experiment is a desktop 3D Shia Factory shell whose state model can later be reused by OpenXR rather than an XR-only prototype.
