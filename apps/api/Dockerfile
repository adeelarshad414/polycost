FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/types/package.json packages/types/package.json
RUN npm ci

COPY tsconfig.base.json ./
COPY packages/types packages/types
COPY apps/api apps/api
WORKDIR /app/apps/api
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/types packages/types
RUN npm ci --omit=dev --workspace @polycost/api --include-workspace-root=false

COPY --from=build --chown=node:node /app/apps/api/dist apps/api/dist
WORKDIR /app/apps/api

# Run as the unprivileged `node` user (uid 1000) that the base image ships.
# A container process running as root shares uid 0 with the host kernel, so any
# container escape or bind-mount write lands with root privileges.
USER node

ENV PORT=3000
EXPOSE 3000

# Liveness, not readiness: this drives Docker's restart decision, and restarting
# the API cannot fix a database or cache that is briefly unavailable. Readiness
# (/health/ready, which does check dependencies) is what an orchestrator should
# poll to decide whether to route traffic here.
# Uses node's global fetch so the image needs no curl/wget.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
