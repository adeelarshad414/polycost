import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const command = process.argv[2] ?? 'validate';
const root = process.cwd();

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

  for (const migration of [
    '001_core_schema.sql',
    '002_least_privilege_roles.sql',
    '003_seed_service_equivalence_map.sql',
  ]) {
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

  if (
    !result.stdout.includes('001') ||
    !result.stdout.includes('002') ||
    !result.stdout.includes('003')
  ) {
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
