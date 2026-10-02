import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const command = process.argv[2] ?? 'validate';
const root = process.cwd();
const migrationsDir = path.join(root, 'database/migrations');

// Discovered, not listed (audit H-06): the hand-written list drifted, and a
// fresh volume silently missed 041/042.
const MIGRATION_FILE = /^(\d{3})_[a-z0-9_]+\.sql$/;

// Audit H-09: from this version on, lock-heavy DDL must be written the
// non-blocking way or carry an explicit, reviewed opt-out. Earlier migrations
// already ran everywhere and are left byte-identical (their checksums are
// recorded by the migrator).
const LOCK_SAFETY_FROM_VERSION = 44;
const LOCK_SAFETY_OPT_OUT = /--\s*migrate:allow-lock\s+\S/;
const LOCK_RULES = [
  {
    pattern: /\bCREATE\s+(UNIQUE\s+)?INDEX\b(?![^;]*\bCONCURRENTLY\b)/i,
    advice:
      'use CREATE INDEX CONCURRENTLY (it blocks writes otherwise; the migrator runs such files outside a transaction)',
  },
  {
    pattern: /\bADD\s+CONSTRAINT\b[^;]*\b(CHECK|FOREIGN\s+KEY)\b(?![^;]*\bNOT\s+VALID\b)/i,
    advice:
      'add CHECK / FOREIGN KEY constraints NOT VALID, then VALIDATE CONSTRAINT in a later statement',
  },
  {
    pattern: /\bALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE\b/i,
    advice:
      'a column type change rewrites the table under an exclusive lock; add a new column and backfill',
  },
  {
    pattern: /\bSET\s+NOT\s+NULL\b/i,
    advice:
      'SET NOT NULL scans the table under an exclusive lock; add a NOT VALID CHECK (col IS NOT NULL) first',
  },
];

if (!['migrate', 'seed', 'reset', 'validate'].includes(command)) {
  console.error(`Unknown db command: ${command}`);
  process.exit(1);
}

if (command === 'validate') {
  validateMigrations();
  validateLiveSchema();
  console.log('Database validation passed.');
} else if (command === 'migrate') {
  validateMigrations();
  migrateDatabase();
} else if (command === 'seed') {
  runDocker(['compose', 'up', '-d', 'vault', 'vault-seed']);
  console.log('Vault seed service requested. Local DB secrets are generated into Docker volumes.');
} else if (command === 'reset') {
  runDocker(['compose', 'down', '-v']);
  runDocker(['compose', 'up', '-d', 'postgres']);
  console.log('Database reset complete. Project Docker volumes were recreated.');
}

function migrationFiles() {
  if (!existsSync(migrationsDir)) {
    fail('Missing database/migrations directory.');
  }
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

function validateMigrations() {
  const files = migrationFiles();
  const seen = new Map();
  const problems = [];

  files.forEach((file, index) => {
    const match = file.match(MIGRATION_FILE);
    if (!match) {
      problems.push(`${file}: name must be NNN_lower_snake_case.sql`);
      return;
    }
    const version = Number(match[1]);
    if (seen.has(match[1])) {
      problems.push(`${file}: version ${match[1]} is also used by ${seen.get(match[1])}`);
    }
    seen.set(match[1], file);
    if (version !== index + 1) {
      problems.push(`${file}: expected version ${String(index + 1).padStart(3, '0')} (no gaps)`);
    }

    const content = readFileSync(path.join(migrationsDir, file), 'utf8');
    if (!content.includes('\\set ON_ERROR_STOP on')) {
      problems.push(`${file}: must enable ON_ERROR_STOP`);
    }
    if (!content.includes('schema_migrations')) {
      problems.push(`${file}: must record itself in schema_migrations`);
    }
    if (version >= LOCK_SAFETY_FROM_VERSION && !LOCK_SAFETY_OPT_OUT.test(content)) {
      const sql = content.replace(/--[^\n]*/g, '');
      for (const rule of LOCK_RULES) {
        if (rule.pattern.test(sql)) {
          problems.push(
            `${file}: ${rule.advice}. If the table is known to be small, add "-- migrate:allow-lock <reason>".`,
          );
        }
      }
    }
  });

  if (problems.length > 0) {
    fail(`Migration validation failed:\n- ${problems.join('\n- ')}`);
  }
  console.log(`Validated ${files.length} migration files.`);
}

function migrateDatabase() {
  runDocker(['compose', 'up', '-d', '--wait', 'postgres']);
  // The same migrator the initdb hook and the Helm Job run (docker/postgres/migrate.sh).
  runDocker([
    'compose',
    'exec',
    '-T',
    '-e',
    'APP_DB_PASSWORD_FILE=/run/polycost-secrets/app_db_password',
    '-e',
    'ETL_DB_PASSWORD_FILE=/run/polycost-secrets/etl_db_password',
    '-e',
    'MIGRATIONS_DIR=/polycost-migrations',
    ...(process.env.MIGRATE_DRY_RUN === '1' ? ['-e', 'MIGRATE_DRY_RUN=1'] : []),
    'postgres',
    'sh',
    '-c',
    'PGUSER="$POSTGRES_USER" PGDATABASE="$POSTGRES_DB" sh /polycost-postgres/migrate.sh',
  ]);
}

function validateLiveSchema() {
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
      'sh',
      '-c',
      'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT version FROM schema_migrations ORDER BY version"',
    ],
    { cwd: root, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    fail(`Live schema_migrations check failed:\n${result.stderr || result.stdout}`);
  }

  const applied = new Set(result.stdout.split('\n').map((line) => line.trim()));
  const pending = migrationFiles()
    .map((file) => file.slice(0, 3))
    .filter((version) => !applied.has(version));
  if (pending.length > 0) {
    fail(
      `The running database is missing migrations ${pending.join(', ')}. Run: npm run db:migrate`,
    );
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
