# Shia Virtual World Theory v0.1

**Status:** Working theory / architecture hypothesis  
**Date:** 2026-08-19  
**Purpose:** Establish a testable foundation for Shia Factory to evolve from a screen-based agent workspace into a persistent spatial world where people, agents, games and tools coexist.

## Thesis

The next major interface shift is likely not that every traditional app disappears into VR. The stronger hypothesis is that **persistent spatial shells will increasingly host activities that are currently separated into apps, games, meetings, dashboards and AI chats**.

For Shia Factory, the useful bet is therefore:

> Build the durable identity, agent, skill, project and world-state layers now; let 2D web, desktop 3D, mobile and XR become interchangeable windows into the same system.

This is a theory to test, not a claim that the market has already converged on one metaverse.

## Why games matter

Games already solve many problems that ordinary software is only beginning to face:

- real-time 3D rendering
- embodied identity and avatars
- spatial navigation
- persistent progression
- multiplayer presence
- physics and interaction
- economies and inventories
- content streaming
- animation and VFX as information
- social spaces
- world simulation
- low-latency input

If workspaces and AI agents become spatial, game-engine knowledge stops being only “game development” knowledge. It becomes interface-infrastructure knowledge.

## Hypothesis 1 — The world becomes the shell; games become realms

Today:

`OS -> app launcher -> individual games/apps`

Possible future:

`persistent identity/world shell -> rooms/portals -> games, workspaces, stores, meetings, simulations`

A user might remain represented by one persistent identity/avatar while entering separate gameplay realms. Each realm can keep its own engine, physics and rules while the shell keeps social presence, identity and permissions.

This avoids the architectural mistake of trying to build one enormous simulation containing every game.

## Hypothesis 2 — AI agents become embodied collaborators

Current AI interfaces are mostly text boxes. Spatial software allows an agent to have:

- a persistent place
- visible availability/state
- a voice and avatar
- shared objects it can point to or manipulate
- a project room containing artifacts and history
- other agents it can consult
- visible work queues and progress

The embodiment must remain honest: an agent should look busy because real runtime state says it is working, not because an idle animation pretends autonomous activity is occurring.

### Three identities of an embodied agent

1. **Cognitive identity** — model-independent agent package, memory, skills, policies and eval history.
2. **World identity** — permissions, position, presence, task state and relationships inside the world.
3. **Visual identity** — avatar, animations, voice, expressions and VFX.

They must remain separable.

## Hypothesis 3 — Games and work will share the same visual technology stack

A high-quality agent headquarters needs many of the same disciplines as a game:

- environment art
- lighting
- character animation
- VFX
- camera design
- interaction systems
- spatial audio
- physics
- networking
- performance optimization

This means investing in game graphics/VFX/animation skills compounds across both entertainment and the Shia Factory interface.

## Hypothesis 4 — Portability is strategic

The future device winner is uncertain. Therefore Shia should not make durable knowledge depend on a headset vendor, model provider or scene format.

### Portability spine

- **OpenXR** — application-to-XR-runtime boundary across VR/AR/MR hardware.
- **OpenUSD** — rich scene description/composition and collaborative authoring.
- **glTF/GLB** — compact runtime asset delivery/interchange.
- **KTX2/Basis Universal** — portable compressed textures for GPUs.

The proposed rule:

> Preserve rich source truth; publish optimized runtime representations; bind neither to one device.

## Hypothesis 5 — Persistence is state, not continuous rendering

A persistent world does **not** need every room, person and agent simulated at all times.

Persistence means the important state survives unloading:

- who owns the object
- where it belongs
- what state it was in
- permissions
- inventory/progression
- project/task state
- durable conversations/decisions where appropriate

Rendering and detailed simulation can be activated only for the relevant room/realm.

## Shia world architecture

```text
DURABLE LAYER
├── User identity
├── Agent identities
├── Skills / memory / provenance
├── Projects / tasks / permissions
└── Persistent world objects
          │
          ▼
WORLD SERVICE
├── Rooms / realms
├── Object state
├── Presence
├── Events
├── Inventory / progression
└── Authority / replication
          │
          ▼
SIMULATION ADAPTERS
├── Shia Factory spatial HQ
├── Rumor Run realm
├── REMIXR environment
├── future games
└── business / training simulations
          │
          ▼
PRESENTATION
├── Web 2D
├── Desktop 3D
├── Mobile 3D
├── VR via OpenXR
└── AR/MR via supported runtimes
```

## The Virtuality Ladder

Do not jump straight to a headset-only build. Each rung must leave reusable infrastructure.

### V0 — Current Factory

2D web-based Shia Factory with visible agents, blocks and inspector.

**Goal:** durable agent/project semantics.

### V1 — Desktop 3D Factory

A navigable 3D headquarters on a normal monitor. Agents occupy spaces and expose real runtime states.

**Goal:** prove world/state separation and visual embodiment.

### V2 — Interactive spatial work

Pick up/move/select project objects, open spatial panels, call agents, walk into project rooms.

**Goal:** semantic interaction system independent of mouse/controller implementation.

### V3 — Multiplayer/presence

Multiple authenticated users can occupy the Factory; authoritative world state is separated from client rendering.

**Goal:** identity, permissions, replication and persistence.

### V4 — OpenXR mode

The same world is entered through a supported headset with controller locomotion and optional hand tracking.

**Goal:** prove device portability without redesigning the core product.

### V5 — Game portals

Rumor Run and later games are represented as doors/portals/arcades/world locations. Entering launches or joins a realm while preserving persistent identity.

**Goal:** one social/spatial shell, modular game simulations.

### V6 — Agent society / production floor

Agents move between project rooms, request reviews, present outputs and collaborate according to real task orchestration and permissions.

**Goal:** make invisible AI workflow spatially understandable without pretending agents possess unsupported autonomy.

## First prototype recommendation

Build **one small Godot 3D Shia Factory room** before building an enormous world.

The room should contain:

- Cristian/player avatar or first-person controller
- Boris avatar
- Gary avatar placeholder
- one project table
- one Rumor Run arcade/portal
- one inspector screen/panel
- agent state indicators: idle/listening/working/reviewing/blocked
- world objects loaded from an engine-neutral JSON/state contract
- abstract actions such as `move`, `look`, `select`, `use`, `call_agent`, `open_project`

The prototype passes only if the same logical state can still be viewed in the existing 2D interface.

That single test prevents us from accidentally making the 3D scene the new database.

## Graphics/VFX implications

The virtual world needs a deliberate readability hierarchy:

- neutral environment values
- strong highlights for interactive objects
- distinct visual language for human vs agent vs system state
- restrained ambient VFX
- strong short VFX for state changes/events
- readable avatar silhouettes
- graphics tiers for desktop and mobile/XR-class hardware

The VFX system should become part of the semantic language. Example:

- soft breathing light = idle/available
- directional pulse = agent receiving a task
- controlled construction particles = artifact being built
- amber warning = blocked/requires human input
- green completion pulse = verified completion
- red should be reserved for actual failure/security/critical states

## What must remain outside the world renderer

Never make any of these exist only in the game engine scene:

- agent memory
- agent permissions
- business records
- project source of truth
- payment state
- user authentication
- durable task/event history
- secrets/API credentials
- ownership records

The world may visualize or manipulate these through authenticated services; it must not become their sole storage.

## Research foundation

This theory is aligned with currently available open infrastructure rather than requiring speculative standards:

- OpenXR 1.1 provides a standardized application interface to XR runtimes across VR/AR/MR devices.
- Godot's XR stack currently documents OpenXR action maps, room-scale, passthrough, composition layers, hand tracking, body tracking and render models.
- OpenUSD is designed for scalable composition/interchange of large 3D scenes across content-creation tools.
- glTF is designed as an API-neutral runtime 3D delivery format.
- KTX2 is designed for efficient GPU texture distribution across platforms.

## Falsifiable tests

The theory should be revised if experiments show:

1. Spatial representation makes project management slower or less understandable than 2D for most tasks.
2. Engine-independent state boundaries create more complexity than value at Shia's scale.
3. XR interaction fails to improve any meaningful workflow or entertainment experience.
4. Users strongly prefer isolated game/app experiences with no value from persistent identity/presence.
5. Cross-engine asset portability costs more than rebuilding for the small number of engines we actually use.

## Next research questions

- What is the minimum world-state schema that supports both 2D and 3D Factory clients?
- Should the first multiplayer service use a general real-time backend or a game-specific networking stack?
- How should agent spatial presence map to task orchestration without misleading the user?
- Which avatar format/rig convention provides the best portability between Godot and future engines?
- How should game achievements/inventory cross realm boundaries without creating security or economy problems?
- What performance tier should define the baseline XR target?

## Foundation sources

- OpenXR Registry: https://registry.khronos.org/OpenXR/
- OpenXR overview: https://www.khronos.org/openxr/
- Godot XR: https://docs.godotengine.org/en/4.5/tutorials/xr/index.html
- Godot OpenXR settings: https://docs.godotengine.org/en/stable/tutorials/xr/openxr_settings.html
- OpenUSD: https://openusd.org/
- glTF 2.0: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
- KTX2: https://registry.khronos.org/KTX/specs/2.0/ktxspec.v2.html

## Version history

- **v0.1 — 2026-08-19:** Initial architecture hypothesis and staged virtuality ladder.
