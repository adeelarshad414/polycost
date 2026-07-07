# DevOps Notes

## Local Services

PolyCost uses Docker Compose for local infrastructure:

- `vault`: local development Vault server
- `vault-seed`: one-shot secret generation and Vault seed job
- `postgres`: local database with bootstrap migrations
- `redis`: BullMQ backing service
- `api`: NestJS/Fastify API
- `web`: Nginx-hosted Vite build

Validate Compose configuration:

```bash
npm run devops:check
docker compose config
```

## CI Flow

GitHub Actions runs:

1. `npm ci`
2. `npm run format:check`
3. `npm run ci:lint`
4. `npm run qa`
5. `npm run graphify:validate`
6. `npm run pricing:coverage:check`
7. `npm run devops:check`
8. `npm run cloud:check`
9. `npm run ci:unit`
10. `npm run ci:integration`
11. `npm run ci:build`
12. `npm run ci:e2e`
13. `npm run security:audit`

## Database Operations

Current migrations are raw SQL files executed during fresh Postgres initialization.

```bash
npm run db:validate
npm run db:migrate
npm run db:seed
npm run db:reset
```

`db:reset` recreates project Docker volumes. Treat it as destructive for local data.

## Release Readiness

Before deployment, run:

```bash
npm run check:full
docker compose up -d --build
curl -fsS http://localhost:3001/health
curl -fsS http://localhost:3000/
```

Record any failures or skipped checks in `PROGRESS.md`.
