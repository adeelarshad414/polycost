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

# Run the whole container as the unprivileged `nginx` user, master included.
#
# nginx already dropped its workers; the master stayed root purely to bind port
# 80. The listener moved to 8080 (see nginx.conf), which leaves two things the
# master can no longer do:
#
#   the pid file  the image's main config writes /run/nginx.pid, and /run is
#                 root-owned. Chowning it is not enough - the first attempt did
#                 exactly that and still failed with EACCES - so the pid is
#                 moved to /tmp, which is writable by anyone and is where the
#                 unprivileged nginx images put it.
#   temp dirs     /var/cache/nginx holds the proxy and fastcgi temp
#                 directories, created at startup.
#
# The `user` directive in the main config is dropped too: it only means anything
# when the master is root, and nginx warns about it on every boot otherwise.
RUN sed -i \
      -e 's#^pid .*#pid /tmp/nginx.pid;#' \
      -e '/^user /d' \
      /etc/nginx/nginx.conf \
  && mkdir -p /var/cache/nginx \
  && chown -R nginx:nginx /var/cache/nginx /etc/nginx/conf.d /usr/share/nginx/html

USER nginx

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:8080/ || exit 1
