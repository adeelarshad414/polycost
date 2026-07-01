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
RUN npm ci --omit=dev --workspace @polycost/api --include-workspace-root=false

COPY --from=build /app/apps/api/dist apps/api/dist
WORKDIR /app/apps/api
CMD ["node", "dist/main.js"]
