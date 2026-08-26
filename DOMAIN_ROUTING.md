# Shia App Factory — Domain Routing Registry

**Canonical root domain:** `shiaco.com`

This file is the model-neutral routing registry for Shia App Factory applications. It records intended public hostnames without exposing production IP addresses, credentials, or private infrastructure details.

## Reserved application hostnames

| Hostname | Application | State |
| --- | --- | --- |
| `marketswarm.shiaco.com` | MarketSwarm Command Center | STAGED — DNS/TLS/Caddy cutover pending |
| `tutor.shiaco.com` | Personal Tutor | RESERVED |
| `michel.shiaco.com` | Michel OS | RESERVED |
| `remixr.shiaco.com` | REMIXR | RESERVED |

## Routing standard

```text
Internet
→ DNS for <app>.shiaco.com
→ Shia Factory VPS public 80/443
→ Caddy HTTPS reverse proxy
→ localhost/private Docker app port
→ application
```

## Cutover rule

A hostname moves from `STAGED` to `LIVE` only after all of these are verified:

1. DNS resolves to the intended production infrastructure.
2. Caddy is running and owns ports 80/443 without displacing an unrelated service.
3. TLS certificate issuance succeeds.
4. HTTPS request to the hostname succeeds.
5. Application health/API checks succeed through the hostname.
6. The raw high app port is changed to localhost-only when practical.
7. Existing user access remains available until the new route is verified.

Do not call a hostname LIVE from repository configuration alone.

## Agent rule

ChatGPT/OpenAI agents, Claude Code, Codex, and other authorized agents must consult this registry before assigning a new public hostname. Do not create competing names for the same canonical application without an explicit routing decision.
