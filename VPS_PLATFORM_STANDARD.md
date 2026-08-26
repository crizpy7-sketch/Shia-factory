# Shia App Factory — Shared VPS Platform Standard

**Status:** ACTIVE / DEFAULT FOR SHARED HOSTING

This standard defines how multiple Shia App Factory applications share one VPS safely and efficiently.

## Target architecture

```text
GitHub repositories
        │
        ▼
GitHub Actions CI/CD
(build/test production images off-host)
        │
        ▼
release image transport / registry
        │
        ▼
┌─────────────────────────────────────────────┐
│ SHIA FACTORY VPS                            │
│                                             │
│ Caddy / HTTPS reverse proxy                 │
│     │                                       │
│     ├─ marketswarm.<domain> → MarketSwarm   │
│     ├─ tutor.<domain>       → Tutor         │
│     ├─ michel.<domain>      → Michel OS     │
│     ├─ remixr.<domain>      → REMIXR        │
│     └─ ...                                   │
│                                             │
│ isolated Docker Compose applications        │
│ persistent named volumes / databases        │
│ health checks + bounded resource use        │
└─────────────────────────────────────────────┘
```

## Core rules

1. **Build off-host.** GitHub Actions should perform application compilation and Docker image builds. The VPS should normally load/pull a finished image, run migrations, start/restart containers, and execute health gates.
2. **One app, one namespace.** Each app gets its own `/opt/<app>` directory, Compose project, container names, persistent volumes, production env file, and internal service network.
3. **No shared public app ports long-term.** During migration an app may expose a temporary high port. The target state is Caddy on ports 80/443 routing hostnames to app-local services.
4. **No cross-app secret files.** Each app owns `/opt/<app>/deploy/.env.production` with restricted permissions.
5. **No app may kill another app to claim a port.** Port collisions are reported or safely reassigned during migration.
6. **Persistent data survives deployments.** Replacing an image/container must not delete named volumes or databases.
7. **Health-gated changes only.** A deployment is not successful until the user-facing route and critical API/worker/daemon health gates pass.
8. **Resource usage is observable.** CPU, RAM, disk and container restart state should be measurable before adding more production workloads.
9. **Heavy services are split when justified.** Databases, compute-heavy workers, or local model inference move to separate infrastructure when they become resource bottlenecks.

## Default VPS sizing stages

These are planning bands, not guarantees; actual capacity depends on workload and traffic.

| Stage | Suggested resources | Use |
| --- | --- | --- |
| Starter | 1–2 vCPU / 4 GB RAM | a few light apps |
| Growth | 4 vCPU / 8 GB RAM / 150+ GB NVMe | several normal apps |
| Factory | 8 vCPU / 16 GB RAM / 200–250+ GB NVMe | many normal apps + workers |
| Scale-out | 16+ GB plus additional nodes | split apps/data/workers by role |

Prefer measuring real CPU/RAM/disk utilization over assuming a fixed app count.

## Build and delivery path

```text
REQUEST
→ AGENT EDITS GITHUB REPO
→ TEST / REVIEW
→ MAIN
→ GITHUB ACTIONS BUILDS IMAGE
→ TRANSFER/PULL FINISHED IMAGE
→ VPS LOAD/PULL
→ MIGRATE
→ COMPOSE UP --NO-BUILD
→ HEALTH GATE
→ LIVE
```

The VPS must not be the normal build machine. This reduces RAM/CPU spikes and allows a smaller server to host more runtime workloads.

## App isolation

Recommended app layout:

```text
/opt/
├── marketswarm/
│   ├── deploy/
│   │   ├── docker-compose.yml
│   │   └── .env.production
│   └── ...
├── tutor/
├── michel-os/
├── remixr/
└── ...
```

Use app-specific named volumes such as `marketswarm-data`, `tutor-data`, etc. Do not reuse another app's volume or database unless a deliberate shared-service architecture has been designed and reviewed.

## Reverse proxy target state

Caddy is the default reverse proxy unless a project has a stronger reason to use another proxy.

Each public app should eventually have a hostname such as:

```text
marketswarm.<domain>
tutor.<domain>
michel.<domain>
remixr.<domain>
```

Caddy terminates HTTPS and proxies to a localhost-only or Docker-network service. Application containers should not expose arbitrary high ports to the public internet once the reverse proxy migration is complete.

Do not deploy production hostnames until DNS ownership and the intended root domain are confirmed.

## Resource controls

For long-running applications, define resource expectations and use limits/reservations where appropriate. A practical initial policy is:

- lightweight web UI: ~128–512 MB expected RAM;
- normal API: ~256–1024 MB expected RAM;
- background worker/agent: workload-specific and measured;
- databases: sized from actual data/connection needs, not arbitrary limits.

Do not set limits so tight that normal bursts create restart loops. Measure first, then tighten.

## Disk discipline

CI should clean temporary release bundles after successful deployment. The VPS should periodically reclaim dangling Docker layers/images while retaining live images and persistent volumes.

Never run broad destructive cleanup commands that can remove named volumes or active application data.

## Scale-out trigger

Do not keep vertically upgrading one VPS indefinitely. Consider a second node when any of these remain sustained after optimization:

- RAM consistently >75–80%;
- CPU consistently saturated during normal runtime, not temporary maintenance;
- disk >75–80% or high persistent I/O pressure;
- one worker's workload materially degrades unrelated apps;
- database reliability/latency requires independent lifecycle;
- local AI inference requires GPU resources.

Typical split:

```text
Node A: Caddy + web/API apps
Node B: databases / stateful services
Node C: workers / agent swarms / compute
GPU node: local inference only when economically justified
```

## Agent rule

ChatGPT/OpenAI agents, Claude Code, Codex and other authorized coding agents should migrate touched repositories toward this standard incrementally. Do not move every old project at once merely for uniformity.

For ordinary code changes, edit GitHub and use CI/CD. Direct VPS work is reserved for infrastructure bootstrap, secrets, DNS/TLS, OS/Docker repair, or recovery, and repeatable manual fixes should be encoded back into the deployment harness.