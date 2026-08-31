FROM node:20-alpine AS build
WORKDIR /app
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/types/package.json packages/types/package.json
RUN npm ci

COPY tsconfig.base.json ./
COPY packages/types packages/types
COPY apps/web apps/web
WORKDIR /app/apps/web
RUN npm run build

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

# nginx already drops its worker processes to the unprivileged `nginx` user; the
# master stays root only to bind port 80. Running the whole container non-root
# additionally requires moving the listener to a port above 1024 and relocating
# the pid/cache paths, which changes the published port contract for compose and
# any deployment. That is a deliberate deployment decision, so it is tracked as
# follow-up rather than changed here - see docs/KNOWN-ISSUES.md.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1/ || exit 1
