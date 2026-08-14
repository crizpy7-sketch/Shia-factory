# Deploying BORIS-001

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

Three services from one image:

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
