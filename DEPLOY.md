# Deploying PolyCost

This guide covers two deployment paths: self-hosting via Docker Compose and
production deployment to a cloud platform. Read `09-CONFIG-AND-SECRETS.md` and
`11-SECURITY.md` before deploying beyond local development. For live-pricing provider
coverage and credentials, read `docs/operations/live-pricing-credentials.md`.

## Part 1 - Self-hosting with Docker Compose

This path is for anyone running PolyCost for themselves or their team without cloud
infrastructure expertise.

### Prerequisites

- Docker Engine 24+ and Docker Compose v2.
- 2 vCPU / 4GB RAM minimum.
- Outbound internet access for nightly pricing ETL calls to AWS, Azure, and GCP
  pricing APIs.

### Steps

1. Clone the repository.

   ```bash
   git clone https://github.com/<org>/polycost.git
   cd polycost
   ```

2. Copy the example environment file.

   ```bash
   cp .env.example .env
   ```

   Per `09-CONFIG-AND-SECRETS.md`, this file contains only non-sensitive config. You
   do not put credentials here.

3. Start the stack.

   ```bash
   docker compose up -d
   ```

   This starts Postgres, Redis, the Vault dev-server, the `vault-seed` job, the
   NestJS API, and the React frontend.

4. Add your LLM API key.

   Natural-language input requires an LLM API key. Secrets never live in files, so
   add the key directly into the running Vault instance:

   ```bash
   docker compose exec vault vault kv put secret/polycost/llm api_key="<your key here>"
   ```

   If this step is skipped, structured-form input still works. Only natural-language
   parsing is affected.

5. Run database migrations.

   ```bash
   npm run db:migrate
   ```

6. Trigger an initial pricing catalog fetch.

   ```bash
   npm run provider:credentials:check
   docker compose restart api
   ```

7. Open the app.

   Visit `http://localhost:3000` or the configured frontend port.

### Verifying a clean install

The self-host flow must work from a genuinely clean checkout with no leftover state.
For development verification, tear down completely first:

```bash
docker compose down -v
```

Then run the self-hosting steps again.

### Updating

```bash
git pull
docker compose pull
docker compose up -d --build
npm run db:migrate
```

### Backups

```bash
docker-compose exec postgres pg_dump -U polycost polycost_prod > backup-$(date +%Y%m%d).sql
docker-compose exec -T postgres psql -U polycost polycost_prod < backup-20260627.sql
```

An untested backup is not a backup. Run a restore against a throwaway database after
setup so the process is known-good before it is needed.

## Part 2 - Production deployment on AWS

AWS is the worked example. The same deployment shape applies to Azure and GCP with
equivalent managed services.

### Target architecture

- Application Load Balancer with HTTPS.
- ECS Fargate service for API and frontend.
- RDS PostgreSQL with Multi-AZ for production.
- ElastiCache Redis.
- Vault self-hosted on a small EC2 or ECS service with AWS IAM auth backend.
- No static credentials in task definitions.

### Steps

1. Provision managed data services.

   - RDS for PostgreSQL, Multi-AZ for production, encryption at rest enabled.
   - ElastiCache for Redis.
   - TLS-required connections.
   - Private subnets with no public ingress.

2. Deploy Vault.

   - Run Vault on a dedicated ECS service or EC2 instance.
   - Configure AWS IAM auth so the ECS task role authenticates without a static
     token.
   - Seed production secrets directly into Vault, never Terraform state or ECS task
     environment blocks.

3. Build and push the container image.

   ```bash
   docker build -t polycost-api:latest .
   docker tag polycost-api:latest <account-id>.dkr.ecr.<region>.amazonaws.com/polycost-api:latest
   docker push <account-id>.dkr.ecr.<region>.amazonaws.com/polycost-api:latest
   ```

   Images are scanned before deployment.

4. Define the ECS task.

   - Only non-secret config values go in the task definition environment block.
   - The IAM task role gets only the permissions required for Vault auth.
   - Do not run parallel secrets paths such as AWS Secrets Manager plus Vault.

5. Configure the Application Load Balancer.

   - HTTPS listener with ACM certificate.
   - HTTP listener redirects to HTTPS.
   - Health check uses a dedicated `/health` endpoint.

6. Run migrations against production as a one-off task.

7. Point DNS at the load balancer and verify HTTPS, app loading, comparison, and
   export journeys.

8. Set up the pricing ETL schedule and verify `pricing_etl_runs` updates within the
   first 24 hours.

### Monitoring and observability

- Ship application logs to CloudWatch Logs or equivalent.
- Use `LOG_LEVEL=info` in production.
- Alert on pricing ETL failures, elevated API `5xx` rate, and RDS storage/CPU
  thresholds.
- Monitor uptime against the public health check endpoint.

### Rotating secrets in production

1. Generate the new credential at the provider.
2. Write the new value into Vault.
3. Wait for the application to pick it up within the `SecretsService` cache TTL.
4. Revoke the old credential after confirming the new one is in use.

## Adapting to Azure or GCP

| AWS | Azure equivalent | GCP equivalent |
| --- | --- | --- |
| RDS for PostgreSQL | Azure Database for PostgreSQL | Cloud SQL for PostgreSQL |
| ElastiCache for Redis | Azure Cache for Redis | Memorystore for Redis |
| ECS Fargate | Azure Container Apps | Cloud Run |
| Application Load Balancer | Azure Application Gateway | Cloud Load Balancing |
| IAM role + Vault AWS auth | Managed Identity + Vault Azure auth | Workload Identity + Vault GCP auth |
| ECR | Azure Container Registry | Artifact Registry |
| CloudWatch | Azure Monitor | Cloud Logging/Monitoring |

The application code, Vault pattern, and security posture are identical across the
three clouds. Only managed service names change.
