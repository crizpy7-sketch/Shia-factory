# Shia agent runtime image.
#
# One image runs every role (api, worker, scheduler) and every roster: the command selects the
# role, and BORIS_AGENTS selects who is hosted.
#
#   headquarters (both)   BORIS_AGENTS unset
#   Boris alone           BORIS_AGENTS=BORIS-001 BORIS_AGENT_ID=BORIS-001
#   Gary alone            BORIS_AGENTS=GARY-001  BORIS_AGENT_ID=GARY-001
#
# An agent whose package is not on disk is simply absent from the roster, so a slimmer image that
# ships one agents/ directory is a valid solo deployment with no code change.
FROM node:22-alpine AS build
WORKDIR /app/boris
COPY boris/package.json boris/package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund
COPY boris/tsconfig.json ./
COPY boris/src ./src
COPY boris/tests ./tests
RUN npx tsc -p tsconfig.json

FROM node:22-alpine AS runtime
# git is needed by the git tool; the rest of the toolchain comes from the base image.
RUN apk add --no-cache git tini && addgroup -S boris && adduser -S boris -G boris
WORKDIR /app

# The portable identity packages are part of the image: the runtime reads them, and an agent whose
# package is missing is not hosted. Both ship by default; a solo image can drop either COPY line.
COPY --chown=boris:boris agents/BORIS-001 ./agents/BORIS-001
COPY --chown=boris:boris agents/GARY-001 ./agents/GARY-001
COPY --chown=boris:boris assets/agents ./assets/agents

# The headquarters and the workbench are served from the same origin as the API.
COPY --chown=boris:boris hq ./hq
COPY --chown=boris:boris index.html ./index.html
COPY --chown=boris:boris blocks ./blocks
COPY --chown=boris:boris agents/registry.js agents/routing.js agents/advisory.js \
     agents/panel.js agents/gary.js agents/hq.js ./agents/

WORKDIR /app/boris
COPY --chown=boris:boris boris/package.json ./
COPY --chown=boris:boris --from=build /app/boris/node_modules ./node_modules
COPY --chown=boris:boris --from=build /app/boris/dist ./dist
COPY --chown=boris:boris boris/public ./public
COPY --chown=boris:boris boris/fixtures ./fixtures

RUN mkdir -p /app/boris/data /app/boris/workspaces && chown -R boris:boris /app/boris/data /app/boris/workspaces
USER boris

ENV NODE_ENV=production \
    BORIS_REPO_ROOT=/app \
    BORIS_DB_PATH=/app/boris/data/boris.db \
    BORIS_WORKSPACE_ROOTS=/app/boris/workspaces \
    BORIS_HOST=0.0.0.0 \
    BORIS_PORT=8787

EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.BORIS_PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/src/cli.js", "serve"]
