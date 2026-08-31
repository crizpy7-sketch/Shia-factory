# Michel OS Phase 7 pilot baseline

Status: live production baseline recorded for Cristian review. No production mutation was performed.

## Evidence boundary

- Factory baseline: merged Phase 7 checkpoint on Shia Factory `main` at `9b32390c24840a523392854808cf170bc77c0698`.
- Application repository: `crizpy7-sketch/Michel-OS` (`https://github.com/crizpy7-sketch/Michel-OS`).
- Repository identity evidence: GitHub repository ID `1345450945`, public visibility, default branch `main`.
- Inspected application commit: `50403bcd52425d3f49788905ebd81962647e2d39`.
- Inspected application tree: `f5da6b89a0588a38ff7704a767aa7a9fc9bb532a`.
- Repository inspection method: exact-SHA detached local checkout plus GitHub repository metadata and history.
- Live-production evidence method: Cristian independently performed a read-only VPS inspection and
  supplied the facts recorded in `live-production-baseline.json`. The evidence records no secrets and
  authorizes no production mutation.

The VPS repository HEAD, `.swarm/deployed-sha` and GitHub `main` all reconcile to the inspected
commit. The running image has no OCI revision/source/version labels, so those matching markers do
**not** independently prove the image's Git revision.

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
| Deployed revision markers | marker-reconciled, image-unverified | `/opt/michel-os` HEAD, clean checkout, `.swarm/deployed-sha` and GitHub `main` are `50403bcd52425d3f49788905ebd81962647e2d39`; OCI revision/source/version labels are absent |
| VPS provider resource identity | partial | VPS filesystem/runtime was observed, but a provider inventory resource ID was not captured |
| Runtime/container/process identity | observed healthy | Compose project `michel-os`; `michel-os-app-1` and `michel-os-db-1` running and healthy; database image `postgres:16-alpine` |
| Service port/domain | observed | app on `127.0.0.1:3100`; Nginx owns 80/443 and routes `michel-2-24-81-191.sslip.io` to the loopback app |
| Current health | observed, release-unbound | `http://127.0.0.1:3100/api/ready` returned `{"ready":true}`; the response does not identify the running release |
| Deployment mechanism | observed | `michel-auto-deploy.timer` is enabled/active; service path `/etc/systemd/system/michel-auto-deploy.service` |
| Logs | interface-known, contents-unverified | Docker and journal interfaces are known; production log contents were not supplied or inferred |
| Database/persistence | observed healthy | `michel-os-db-1` is healthy with a persistent PostgreSQL Docker volume; backups path is mounted at `/backups` |
| Backup/recovery | integrity-verified, recoverability-unverified | multiple dumps observed; latest `michel-20260828T045731Z.sql.gz` passed `gzip -t` with recorded SHA-256, but no restore test was evidenced |
| Environment integrations | needs-evidence | OpenAI is optional; enabled production integrations were not inspected |

This evidence completes the bounded “Inspect and profile Michel OS” tracker item. It does not make
the selected pilot deployable and is not a Phase 5 Quality Gate receipt.

### Action-specific production gate

The deterministic task contract now keeps safe engineering work separate from production mutation:

- inspect, plan, isolated build and test remain routable;
- production deploy is `precondition-blocked`;
- `executionBlocked` remains false because the isolated candidate may be built and tested;
- `certificationReleaseBlocked` remains true while production prerequisites are missing;
- evaluation records `productionMutationPerformed: false`.

Repository revision, runtime identity and health baseline are now independently observed. Production
deploy remains `precondition-blocked` because an executable rollback procedure, restore/recovery proof,
independent exact running-image provenance, an exact-candidate trusted Quality Gate PASS and Cristian
deploy approval are not present. Backup-file integrity is not restore proof; approval or Quality
evidence alone cannot replace the other prerequisites, and stale SHA-bound evidence cannot clear them.

### Corrected provider routing

The corrected selected tools are `github` and `vps`. Self-hosted PostgreSQL is provider-neutral and
does not select Supabase. Supabase remains supported only when APP_PROFILE, an integration or the task
itself explicitly identifies Supabase.

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
- Phase 7 tracker completion: 1/4. “Inspect and profile Michel OS” is complete from repository evidence plus Cristian's independently observed read-only VPS baseline; lifecycle deploy/observe, Quality Gate evidence and reusable extraction remain incomplete.
- Approved Core v2 progress: 31/41 = 75.61%.
- Phase 8: not started.
