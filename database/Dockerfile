# PolyCost migrations image (audit H-06). Run by the Helm pre-install /
# pre-upgrade Job; the same migrator the compose initdb hook and
# `npm run db:migrate` use. Build from the repository root:
#   docker build -f database/Dockerfile -t polycost-migrations .
FROM alpine:3.24

# psql only; no server. sha256sum comes from busybox. `apk upgrade` picks up
# security fixes released after the base image (audit H-13).
RUN apk upgrade --no-cache \
  && apk add --no-cache postgresql16-client \
  && adduser -D -H -u 10001 migrator

COPY docker/postgres/migrate.sh /usr/local/bin/polycost-migrate
COPY database/migrations /polycost-migrations

ENV MIGRATIONS_DIR=/polycost-migrations
USER 10001
ENTRYPOINT ["sh", "/usr/local/bin/polycost-migrate"]
