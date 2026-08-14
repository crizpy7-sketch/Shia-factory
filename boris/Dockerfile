# BORIS-001 runtime image.
#
# One image runs every role (api, worker, scheduler); the command selects which.
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

# BORIS's portable identity and avatar assets are part of the image: the runtime reads them,
# and refuses to start without them.
COPY --chown=boris:boris agents/BORIS-001 ./agents/BORIS-001
COPY --chown=boris:boris assets/agents/boris-001 ./assets/agents/boris-001

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
