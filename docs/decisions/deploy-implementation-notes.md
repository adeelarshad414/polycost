# Deploy Implementation Notes

These notes capture build-impact requirements from `DEPLOY.md`.

## Self-Host Stack

Phase 1 Docker Compose must include:

- Postgres
- Redis
- Vault dev-server
- `vault-seed` job
- NestJS API
- React frontend

The clean-install path is:

1. Copy `.env.example` to `.env`.
2. Run `docker-compose up -d`.
3. Add the LLM API key directly to Vault.
4. Run `npm run migrate` inside the API container.
5. Run `npm run pricing:fetch-now` inside the API container.
6. Open the frontend.

## Verification

- Phase 1 and final verification require `docker-compose down -v` followed by a clean
  stack startup.
- Postgres and Redis should not be exposed publicly by default.
- The Vault dev token must stay local/dev-only.

## API Implications

- Add `/health` during the API phase because production deployment and load balancer
  health checks depend on it.
- Report `/health` as a documented deployment requirement filling an API contract
  omission.

## Production Shape

- AWS worked example: ALB, ECS Fargate, RDS PostgreSQL, ElastiCache Redis, Vault with
  AWS IAM auth.
- Azure and GCP follow equivalent managed-service substitutions.
- Production task definitions contain non-secret config only.
- Secrets live only in Vault.
