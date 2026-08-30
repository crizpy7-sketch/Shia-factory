# Michel OS Phase 7 pilot baseline

Status: inspection candidate for Cristian review. No production mutation was performed.

## Evidence boundary

- Factory baseline: Shia Factory `main` at `cdd1a9299178e67432df2b2c0e64c71c0ff14623`.
- Application repository: `crizpy7-sketch/Michel-OS` (`https://github.com/crizpy7-sketch/Michel-OS`).
- Repository identity evidence: GitHub repository ID `1345450945`, public visibility, default branch `main`.
- Inspected application commit: `50403bcd52425d3f49788905ebd81962647e2d39`.
- Inspected application tree: `f5da6b89a0588a38ff7704a767aa7a9fc9bb532a`.
- Inspection method: exact-SHA detached local checkout plus GitHub repository metadata and history.
- Production observation: unavailable. No trusted Hostinger/VPS connector, SSH host, production hostname or read-only runtime credential was exposed to this session.

Repository state and production state are deliberately separate. The current GitHub `main` commit is **not** claimed as the deployed commit.

## Stage 7A — repository inventory

| Surface | Evidence-backed finding |
| --- | --- |
| Framework/runtime | Node.js 22, ESM TypeScript executed with native type stripping; framework-free `node:http` server |
| Frontend | Server-generated HTML shell, static vanilla JavaScript modules and CSS, client-side API calls, responsive PWA manifest |
| Backend | Custom HTTP router and typed domain/API layers in `server/`, `domains/` and `lib/contracts/` |
| Persistence | PostgreSQL 16 in production through `pg`; PGlite for deterministic tests; SQL migrations run before listen and applied checksums are verified |
| Authentication | Custom invitation, password and session system; household membership/roles; secure-cookie and request-origin protections |
| Application APIs | Health/readiness, authentication, households/members, scheduling/conflicts, reminders, shopping, errands, inbox, search, notifications, business staffing, inventory, sales, expenses and an AI proposal/execution surface |
| AI integration | Optional OpenAI Responses API; deterministic local parser fallback; proposed model actions are revalidated by application policy |
| Build/run | No compilation bundle; `npm start` runs `server/main.ts`; Docker image uses Node 22 slim and a non-root `node` user |
| Tests | `npm test`, `npm run typecheck`, `npm run gauntlet`; current local gauntlet executed 9/9 challengers and 644 tests |
| CI | `.github/workflows/gauntlet.yml` runs the gauntlet on pushes and pull requests to `main` and retains `.swarm` evidence |
| Deployment | Docker Compose app + PostgreSQL; standalone Caddy mode or shared-VPS loopback mode; pull-based systemd auto-deploy timer with CI, backup, readiness and rollback steps |
| Reverse proxy | Standalone Caddy publishes 80/443; shared-VPS mode binds only `127.0.0.1:${MICHEL_BIND_PORT:-3100}` and expects a host-managed HTTPS proxy |
| Monitoring/logging | `/api/health`, database-backed `/api/ready`, Docker logs and auto-deploy systemd journal; no repository evidence of external alerting |
| Documentation | README, architecture/product/data handoffs, design docs, QA docs, ADR and deployment/shared-VPS runbooks |

### Stack classification

Michel OS is a justified legacy-stack deviation from the Core v2 Golden App Stack. `docs/decisions/ADR-001-runtime-and-storage.md` intentionally selects self-hosted Node + PostgreSQL + Caddy for private-household data residency and operational simplicity. It is not Next.js, Supabase or Vercel. Phase 7 should preserve the working architecture unless evidence proves a concrete migration benefit.

`docs/DELIVERY_STATUS.md` is stale: it says frontend and persistence are not started, while the inspected tree contains both. Current source, tests and deployment documentation take precedence.

### Environment contract — names only

No values were read or recorded.

- Required application/deployment names: `DATABASE_URL`, `BASE_URL`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`.
- Optional/configurable names: `PORT`, `EXTRA_ORIGINS`, `ALLOW_INSECURE`, `PUBLIC_DIR`, `SKIP_SCHEMA_VERIFY`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `CADDY_DOMAIN`, `MICHEL_BIND_PORT`, `MICHEL_PROJECT`, `MICHEL_COMPOSE_FILE`, `MICHEL_DEPLOY_BRANCH`, `MICHEL_CI_WORKFLOW`, `MICHEL_REQUIRE_CI`, `GITHUB_TOKEN`.
- Secret-bearing names: `DATABASE_URL`, `POSTGRES_PASSWORD`, `OPENAI_API_KEY`, `GITHUB_TOKEN`. These must be resolved only through an authorized production adapter and must never enter Factory receipts.

## Stage 7B — production baseline

| Required fact | State | Evidence/gap |
| --- | --- | --- |
| Deployed Git SHA | needs-evidence | Must be read from the live `.swarm/deployed-sha` and reconciled with the running image/process; GitHub `main` is insufficient |
| VPS identity/IP/provider resource | needs-evidence | Hostinger is user-reported, but no trusted VPS inventory adapter was callable |
| Runtime/container/process identity | needs-evidence | Repository defines Docker Compose/systemd topology; live `docker compose ps` and systemd state were not observable |
| Service port/domain | needs-evidence | Repository contains loopback defaults and example domains only; no production hostname was inferred |
| Current health | needs-evidence | Repository tests passed, but the live `/api/ready` endpoint could not be located or queried |
| Deployment mechanism | repository-verified, runtime-unverified | Pull-based systemd timer and Compose scripts exist; live installation/configuration is unproven |
| Logs | interface-known, contents-unverified | Docker and journal commands are documented; no production logs were accessed |
| Database/persistence | repository-verified, runtime-unverified | PostgreSQL volume/dependency is declared; live database identity, size and state were not inspected |
| Backup/recovery | procedure-known, recoverability-unverified | Backup/restore scripts and 28-day local retention exist; no backup inventory, off-box copy or restore proof was available |
| Environment integrations | needs-evidence | OpenAI is optional; enabled production integrations were not inspected |

The absence of live evidence blocks deployment approval. It does not invalidate the repository architecture inventory.

## Verification performed

At Michel OS commit `50403bcd52425d3f49788905ebd81962647e2d39`:

```text
npm ci                                  PASS — 27 packages installed
npm run gauntlet                        PASS — 9/9 challengers
typecheck                               PASS — 0 errors
unit-tests                              PASS — 644 pass, 0 fail, 13 files
purity                                  PASS
definition-of-done                      PASS
determinism                             PASS — 15/15 checks
adversarial-security                    PASS — 25/25 checks
performance                             PASS — 6/6 checks
```

Three non-blocking legacy ownership warnings remain for `tests/unit/ai-shopping-command.test.ts`, `tests/unit/assistant-provider-normalize.test.ts` and `tests/unit/auth-view-import.test.ts`. This local run is repository evidence, not an admitted Phase 5 Quality Gate receipt and not proof of production health.

## Governance state

- Production mutations performed: none.
- Michel OS repository mutations performed: none.
- Secrets read or persisted: none.
- DNS/proxy/container/process/database changes: none.
- Phase 7 tracker completion: unchanged. The top-level “Inspect and profile Michel OS” item remains incomplete until the live production baseline is independently observed or Cristian explicitly accepts the documented evidence gaps.
- Phase 8: not started.
