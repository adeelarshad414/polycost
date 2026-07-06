import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const command = process.argv[2] ?? 'validate';
const root = process.cwd();
const expectedMigrations = [
  '001_core_schema.sql',
  '002_least_privilege_roles.sql',
  '003_seed_service_equivalence_map.sql',
  '004_seed_local_pricing_catalog.sql',
  '005_backend_architecture_tables.sql',
  '006_cost_management_jobs.sql',
  '007_pricing_etl_run_counters.sql',
  '008_pricing_model_terms.sql',
  '009_pricing_rates_matrix.sql',
  '010_share_link_context.sql',
  '011_seed_local_commitment_pricing_catalog.sql',
  '012_production_depth_audit_analytics.sql',
  '013_report_export_jobs.sql',
  '014_comparison_prewarm_jobs.sql',
  '015_seed_accelerated_compute_pricing_catalog.sql',
  '016_pricing_cache_sync_status.sql',
  '017_seed_burstable_compute_catalog.sql',
  '018_pricing_rates_active_uniqueness.sql',
  '019_comparison_audit_rate_evidence.sql',
  '020_pricing_rates_estimate_only_guard.sql',
  '021_seed_distinct_payment_option_rates.sql',
  '022_diagram_imports.sql',
  '023_seed_sql_server_database_catalog.sql',
  '024_comparison_audit_pricing_trace.sql',
  '025_account_team_foundation.sql',
];

if (!['migrate', 'seed', 'reset', 'validate'].includes(command)) {
  console.error(`Unknown db command: ${command}`);
  process.exit(1);
}

if (command === 'validate') {
  await validateMigrations();
  console.log('Database validation passed.');
} else if (command === 'migrate') {
  await migrateDatabase();
} else if (command === 'seed') {
  runDocker(['compose', 'up', '-d', 'vault', 'vault-seed']);
  console.log('Vault seed service requested. Local DB secrets are generated into Docker volumes.');
} else if (command === 'reset') {
  runDocker(['compose', 'down', '-v']);
  runDocker(['compose', 'up', '-d', 'postgres']);
  console.log('Database reset complete. Project Docker volumes were recreated.');
}

async function migrateDatabase() {
  runDocker(['compose', 'up', '-d', 'postgres']);

  const appliedVersions = liveMigrationVersions(await readLiveSchemaMigrations());
  const missingMigrations = expectedMigrations.filter(
    (migration) => !appliedVersions.has(migration.slice(0, 3)),
  );

  if (missingMigrations.length === 0) {
    console.log('Database service is up. No pending migrations found.');
    await validateMigrations();
    return;
  }

  for (const migration of missingMigrations) {
    console.log(`Applying migration ${migration}...`);
    applyMigration(migration);
  }

  await validateMigrations();
  console.log(`Database migrated successfully: ${missingMigrations.join(', ')}`);
}

async function validateMigrations() {
  const migrationsDir = path.join(root, 'database/migrations');
  if (!existsSync(migrationsDir)) {
    fail('Missing database/migrations directory.');
  }

  for (const migration of expectedMigrations) {
    const migrationPath = path.join(migrationsDir, migration);
    if (!existsSync(migrationPath)) {
      fail(`Missing migration: ${migration}`);
    }

    const content = await readFile(migrationPath, 'utf8');
    if (!content.includes('\\set ON_ERROR_STOP on')) {
      fail(`${migration} must enable ON_ERROR_STOP.`);
    }
    if (!content.includes('schema_migrations')) {
      fail(`${migration} must update schema_migrations.`);
    }
  }

  const status = spawnSync('docker', ['compose', 'ps', '--status=running', 'postgres'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (status.error || status.status !== 0 || !status.stdout.includes('postgres')) {
    console.warn(
      'Warning: Postgres container is not running; skipped live schema_migrations check.',
    );
    return;
  }

  const schemaMigrationsOutput = await readLiveSchemaMigrations();
  const appliedVersions = liveMigrationVersions(schemaMigrationsOutput);

  const missingVersions = expectedMigrations
    .map((migration) => migration.slice(0, 3))
    .filter((version) => !appliedVersions.has(version));

  if (missingVersions.length > 0) {
    fail(`Live schema_migrations output is missing expected versions:\n${schemaMigrationsOutput}`);
  }
}

async function readLiveSchemaMigrations() {
  const result = spawnSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'polycost_owner',
      '-d',
      'polycost_dev',
      '-c',
      'SELECT version, name FROM schema_migrations ORDER BY version;',
    ],
    { cwd: root, encoding: 'utf8' },
  );

  if (result.status !== 0) {
    fail(`Live schema_migrations check failed:\n${result.stderr || result.stdout}`);
  }

  return result.stdout;
}

function liveMigrationVersions(schemaMigrationsOutput) {
  const versions = new Set();

  for (const line of schemaMigrationsOutput.split('\n')) {
    const match = line.match(/^\s*(\d{3})\s*\|/);

    if (match) {
      versions.add(match[1]);
    }
  }

  return versions;
}

function applyMigration(migration) {
  if (migration === '002_least_privilege_roles.sql') {
    runDocker([
      'compose',
      'exec',
      '-T',
      'postgres',
      'sh',
      '-lc',
      'APP_DB_PASSWORD="$(cat /run/polycost-secrets/app_db_password)"; ETL_DB_PASSWORD="$(cat /run/polycost-secrets/etl_db_password)"; psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set app_password="$APP_DB_PASSWORD" --set etl_password="$ETL_DB_PASSWORD" --file /polycost-migrations/002_least_privilege_roles.sql',
    ]);
    return;
  }

  runDocker([
    'compose',
    'exec',
    '-T',
    'postgres',
    'psql',
    '-U',
    'polycost_owner',
    '-d',
    'polycost_dev',
    '-f',
    `/polycost-migrations/${migration}`,
  ]);
}

function runDocker(args) {
  const result = spawnSync('docker', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
  });

  if (result.error) {
    fail(`Docker command failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`Docker command failed: docker ${args.join(' ')}`);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
