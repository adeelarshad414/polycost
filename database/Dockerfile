# PolyCost database tools image. Default entrypoint: the migrator (audit H-06),
# run by the Helm pre-install / pre-upgrade Job - the same one the compose
# initdb hook and `npm run db:migrate` use. Also ships the encrypted backup and
# restore scripts (audit H-16) used by the backup CronJob and the nightly drill:
#   polycost-backup / polycost-restore  (override the entrypoint)
# Build from the repository root:
#   docker build -f database/Dockerfile -t polycost-migrations .
FROM alpine:3.24

# psql only; no server. sha256sum comes from busybox. `apk upgrade` picks up
# security fixes released after the base image (audit H-13).
# SECURITY_PATCH_STAMP changes every day in CI (release.yml), so this layer is
# rebuilt instead of replayed from the build cache; a cached `apk upgrade`
# silently kept packages from the day it was first cached.
ARG SECURITY_PATCH_STAMP=local
RUN echo "security patches: ${SECURITY_PATCH_STAMP}" \
  && apk upgrade --no-cache \
  && apk add --no-cache postgresql16-client age rclone \
  && adduser -D -H -u 10001 migrator

COPY docker/postgres/migrate.sh /usr/local/bin/polycost-migrate
COPY docker/postgres/backup.sh /usr/local/bin/polycost-backup
COPY docker/postgres/restore.sh /usr/local/bin/polycost-restore
COPY database/migrations /polycost-migrations

ENV MIGRATIONS_DIR=/polycost-migrations
USER 10001
ENTRYPOINT ["sh", "/usr/local/bin/polycost-migrate"]
