# Backup and Disaster Recovery

This document sets PolyCost's recovery objectives, the mechanisms that meet them,
and how they are proven (audit H-16). The incident procedure itself is in the
[runbook](RUNBOOK.md#backup-and-restore).

> **Defaults to confirm.** The targets below are the project's recommended
> defaults for a production deployment. Each operator must confirm them, or tighten them,
> against their own obligations, and record the decision.

## Recovery objectives by data class

**RPO** (recovery point objective) is how much data may be lost. **RTO**
(recovery time objective) is how long recovery may take.

| Class                        | What it holds                                      | Tables (examples)                                                         | RPO              | RTO       | Primary mechanism                          | Second line                                                                        |
| ---------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------- | ---------------- | --------- | ------------------------------------------ | ---------------------------------------------------------------------------------- |
| **A. Compliance records**    | Evidence that must not be lost or altered          | `invoice_artifact_blobs`, `team_audit_events`, `team_audit_export_outbox` | **≤ 5 min**      | **≤ 4 h** | Managed PITR                               | Nightly encrypted backup; audit events are also exported to the SIEM/WORM receiver |
| **B. Accounts and tenancy**  | Who can sign in, and to what                       | accounts, teams, memberships, invitations, SSO and SCIM configuration     | **≤ 15 min**     | **≤ 4 h** | Managed PITR                               | Nightly encrypted backup                                                           |
| **C. User work**             | What users built and shared                        | workloads, comparisons, budgets, alerts, share links, reports             | **≤ 1 h**        | **≤ 8 h** | Managed PITR                               | Nightly encrypted backup                                                           |
| **D. Pricing catalogue**     | Provider prices, rebuildable from the source       | `pricing_catalog`, `pricing_rates`, provider SKUs                         | **≤ 24 h**       | **≤ 2 h** | Re-run the pricing ETL                     | Nightly encrypted backup                                                           |
| **E. Derived and transient** | Queues, rate-limit counters, caches                | Redis (BullMQ jobs, counters)                                             | not backed up    | minutes   | Recreated on start; schedulers re-register | Redis AOF persistence (compose and the chart's requirements)                       |
| **F. Secrets**               | Database roles, provider credentials, signing keys | Vault                                                                     | per Vault policy | ≤ 4 h     | Vault's own snapshots (Raft)               | Out of scope for this repository; required by the deployment                       |

Classes A–D share one PostgreSQL database, so in practice the tightest RPO (class A)
sets the backup configuration for the whole database.

## Mechanisms

### 1. Managed point-in-time recovery (primary)

Use the provider's continuous backup with PITR: RDS or Aurora, Cloud SQL, or Azure
Database for PostgreSQL Flexible Server. WAL archiving gives an RPO of minutes. Set:

- **Retention ≥ 35 days**, so logical corruption noticed late is still recoverable.
- **Encryption at rest** with a customer-managed key.
- **Cross-region copies of the automated snapshots**, for regional loss.

### 2. Encrypted off-site logical backups (second line)

The Helm `backup` CronJob (`templates/backup-cronjob.yaml`, off by default) runs
`docker/postgres/backup.sh` from the database tools image every night.

- **What it captures:** `pg_dumpall --globals-only`, which holds the cluster roles. Without them the
  application cannot log in after a restore. It also captures `pg_dump -Fc`.
- **Integrity:** a manifest records each file's sha256. Suspiciously small dumps are refused.
- **Encryption:** each file is encrypted with [age](https://age-encryption.org) to a **public key**.
  The cluster can write backups but never read them. The private key is kept offline
  and used only for restores.
- **Destination:** files are written through **rclone** to any object store (S3, GCS, Azure Blob).
  Use a bucket in a **different account and region** from the database, with
  object lock or versioning, so one compromised account cannot delete both copies.
- **Retention:** `backup.retentionDays` (default 35) deletes older backups.

This line covers what PITR does not: losing the database's cloud account,
corruption older than the PITR window, and moving to another provider. The last
one matters for a multi-cloud product.

```yaml
# values.yaml
backup:
  enabled: true
  ageRecipient: age1… # public key; private key stays offline
  destination: ':s3:polycost-backups-dr/prod'
  storageCredentialsSecret: polycost-backup-rclone # or workload identity
```

### 3. Restore

`docker/postgres/restore.sh` reverses the backup:

1. Fetch the newest backup, or `BACKUP_STAMP`.
2. Decrypt it.
3. **Verify every file against the manifest.**
4. Restore the roles first, then the database, into a database that doesn't exist yet.

A wrong key or a tampered file stops the restore before anything is created.
The runbook has the full incident procedure. In short: stop writers, restore,
fingerprint, then reopen traffic.

## How it is proven

| Proof                                                        | When                                                      | What it shows                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Nightly CI drill** (`.github/workflows/restore-drill.yml`) | Every night, plus PRs that touch backup or migration code | Builds a database with the real migrator, backs it up with `backup.sh` (encrypted, through rclone), restores with `restore.sh` into a **brand-new cluster**, and compares row counts, sequences, constraints, indexes, roles and content hashes. A failed scheduled run opens a GitHub issue. |
| `npm run db:restore-drill`                                   | On demand, locally                                        | The same comparison against your compose database. Add `--mode production` to use the production scripts.                                                                                                                                                                                     |
| Production restore exercise                                  | Quarterly (operator)                                      | Restore last night's backup into an isolated environment, time it against the RTO, and record the result. The CI drill uses synthetic data, so only this proves production-sized timings.                                                                                                     |

## What is not covered

- **Vault:** Vault snapshots and unseal-key custody belong to the Vault deployment.
- **Redis:** queued jobs are recreated by the schedulers; nothing in Redis is a system of record.
- **Object storage for invoice artifacts**, when an external backend is configured: use
  that store's versioning and object lock. The database keeps the governance metadata.
