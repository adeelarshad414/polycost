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
];

if (!['migrate', 'seed', 'reset', 'validate'].includes(command)) {
  console.error(`Unknown db command: ${command}`);
  process.exit(1);
}

if (command === 'validate') {
  await validateMigrations();
  console.log('Database validation passed.');
} else if (command === 'migrate') {
  runDocker(['compose', 'up', '-d', 'postgres']);
  console.log('Database service is up. Bootstrap migrations run on fresh Postgres volumes.');
} else if (command === 'seed') {
  runDocker(['compose', 'up', '-d', 'vault', 'vault-seed']);
  console.log('Vault seed service requested. Local DB secrets are generated into Docker volumes.');
} else if (command === 'reset') {
  runDocker(['compose', 'down', '-v']);
  runDocker(['compose', 'up', '-d', 'postgres']);
  console.log('Database reset complete. Project Docker volumes were recreated.');
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

  const missingVersions = expectedMigrations
    .map((migration) => migration.slice(0, 3))
    .filter((version) => !result.stdout.includes(version));

  if (missingVersions.length > 0) {
    fail(`Live schema_migrations output is missing expected versions:\n${result.stdout}`);
  }
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
