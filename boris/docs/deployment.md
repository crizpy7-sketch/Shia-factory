# Deploying the agents

There are two shapes, and the difference is only which agents a runtime hosts:

| Shape | What it is | File |
| --- | --- | --- |
| **Headquarters** | Both agents, one address. The Office assigns work, the Boardroom convenes meetings, the Factory is served from the same origin | `docker-compose.yml` |
| **Solo** | One agent on his own VPS, his own database, his own port, no colleague and no headquarters | `docker-compose.solo.yml` |

Same image, same code. An agent is hosted when `BORIS_AGENTS` names him **and** his package is on
disk; leaving `BORIS_AGENTS` unset hosts everything the image carries. There is no build variant and
no second codebase — which is the point: an agent you can only run inside the Factory is not
portable, and portability is what his package is for.

## One agent alone on a VPS

```sh
cp boris/.env.example boris/.env
#   ANTHROPIC_API_KEY=sk-ant-...
#   BORIS_API_TOKEN=$(openssl rand -hex 32)     # Boris's stack
#   GARY_API_TOKEN=$(openssl rand -hex 32)      # Gary's stack

docker compose -f boris/docker-compose.solo.yml --env-file boris/.env --profile boris up -d
docker compose -f boris/docker-compose.solo.yml --env-file boris/.env --profile gary  up -d
```

Boris answers on `127.0.0.1:8787`, Gary on `127.0.0.1:8788`, with separate volumes. Neither knows
the other exists: a solo runtime refuses work addressed to an absent colleague rather than running
it as whoever is loaded, and it cannot convene a meeting because a meeting needs two.

Verify who a stack is hosting:

```sh
docker compose -f boris/docker-compose.solo.yml exec gary-api node dist/src/cli.js agents
# GARY-001  Gary (primary)  11 tools  IDENTITY_SEEDED_..._RECERTIFICATION_PENDING
```

Without Docker, the same thing runs directly:

```sh
BORIS_AGENTS=GARY-001 BORIS_AGENT_ID=GARY-001 node dist/src/cli.js run
```

`BORIS_AGENT_ID` sets the primary agent — the one a bare `submit` addresses and the one `status`
reports. `identityDir` follows it, so no second variable is needed.

## Both agents together — the headquarters

## Docker Compose (recommended)

From the repository root:

```sh
cp boris/.env.example boris/.env
# set at minimum:
#   ANTHROPIC_API_KEY=sk-ant-...
#   BORIS_API_TOKEN=$(openssl rand -hex 32)

docker compose -f boris/docker-compose.yml --env-file boris/.env build
docker compose -f boris/docker-compose.yml --env-file boris/.env up -d
docker compose -f boris/docker-compose.yml exec boris-api node dist/src/cli.js bootstrap
```

This stack is what the headquarters expects: the Office can assign work to either agent, and the
Boardroom can seat both. Three services from one image:

| Service | Command | Role |
| --- | --- | --- |
| `boris-api` | `cli.js serve` | HTTP API, SSE stream, dashboard. Bound to `127.0.0.1` — put your own TLS reverse proxy in front |
| `boris-worker` | `cli.js worker` | Claims and executes tasks. The only service that runs tools |
| `boris-scheduler` | `cli.js scheduler` | Fires durable schedules |

State lives in two named volumes: `boris-data` (the database) and `boris-workspaces` (the
directories BORIS may touch). Both must persist across upgrades or outstanding work is lost.

## Reverse proxy

The API binds to localhost inside the container and is published on `127.0.0.1:8787`. Terminate TLS
outside and forward. The SSE endpoint `/api/stream` needs buffering disabled:

```nginx
location / {
  proxy_pass http://127.0.0.1:8787;
  proxy_http_version 1.1;
  proxy_set_header Connection '';
  proxy_buffering off;      # required for /api/stream
  proxy_read_timeout 1h;
}
```

## Bare VPS (no Docker)

```sh
sudo apt-get install -y nodejs git   # Node 22.5+ required (node:sqlite)
git clone <repo> /opt/shia && cd /opt/shia/boris
npm ci && npm run build
cp .env.example .env && $EDITOR .env
node dist/src/cli.js migrate && node dist/src/cli.js bootstrap
```

systemd units — one per role, both restart on failure:

```ini
# /etc/systemd/system/boris-api.service
[Unit]
Description=BORIS-001 API
After=network.target

[Service]
Type=simple
User=boris
WorkingDirectory=/opt/shia/boris
EnvironmentFile=/opt/shia/boris/.env
ExecStart=/usr/bin/node dist/src/cli.js serve
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/opt/shia/boris/data /opt/shia/boris/workspaces

[Install]
WantedBy=multi-user.target
```

Copy for `boris-worker.service` with `ExecStart=/usr/bin/node dist/src/cli.js worker`, then:

```sh
sudo systemctl enable --now boris-api boris-worker
```

## Health and monitoring

`GET /api/health` is unauthenticated and returns agent id, uptime, boot id, provider availability
and queue depth. It is the container healthcheck and the right target for an external probe.

`GET /api/status` (authenticated) adds heartbeat, current task, current tool and configured limits.
Every event is persisted in `events`; `GET /api/events?since=<id>` gives an incremental feed for log
shipping.

## Upgrades

```sh
git pull
docker compose -f boris/docker-compose.yml build
docker compose -f boris/docker-compose.yml up -d
```

Migrations run automatically at start and are idempotent. In-flight work survives: the new process
marks runs from the previous boot as `interrupted` and requeues their tasks. Give the worker
`stop_grace_period` (30s by default) so a task can finish its current tool call.

## Backup and restore

Everything durable is the database plus the workspaces:

```sh
docker compose -f boris/docker-compose.yml stop boris-worker
docker run --rm -v boris_boris-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/boris-data-$(date +%F).tar.gz -C /data .
docker compose -f boris/docker-compose.yml start boris-worker
```

Stop the worker first: SQLite in WAL mode is safe to copy live, but a backup taken mid-task captures
a half-finished run that will be requeued on restore.

## Security checklist before exposing BORIS

- [ ] `BORIS_API_TOKEN` set and `BORIS_REQUIRE_AUTH=true`
- [ ] TLS terminated by a proxy; the container port stays on loopback
- [ ] `BORIS_WORKSPACE_ROOTS` points only at directories BORIS may modify
- [ ] `BORIS_MAX_COST_USD` and `BORIS_MAX_MODEL_CALLS` set to what you are willing to spend
- [ ] `BORIS_ALLOW_TEST_PROVIDER` **unset** — the scripted provider is a test double
- [ ] Approval requests are actually watched; a blocked task waits forever otherwise
- [ ] Backups scheduled and restored once, to prove they work
