#!/usr/bin/env node
// Proves the backups can actually be restored.
//
// A backup that has never been restored is a hope, not a recovery plan. This
// drill takes a real backup of the running database, restores it into a
// COMPLETELY SEPARATE, EMPTY Postgres cluster, and compares a structural and
// content fingerprint of the two.
//
// The separate cluster is the whole point. Restoring into the existing one
// would pass while proving nothing: the roles, extensions and database already
// exist there, so the two most common real-world restore failures - missing
// cluster roles and a missing target database - cannot occur. Migration 002
// creates polycost_app and polycost_etl as cluster-level roles, and pg_dump
// does not include them.
//
// The drill never touches the source database. It only reads.
//
// Usage: node scripts/restore-drill.mjs [--keep]
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = parseArgs(process.argv.slice(2));
const sourceContainer = args.container ?? 'polycost-postgres-1';
const database = args.database ?? 'polycost_dev';
const owner = args.owner ?? 'polycost_owner';
const drillContainer = 'polycost-restore-drill';
const drillPort = args.port ?? '55433';
const evidenceDir = path.resolve(args.evidence ?? 'docs/verification');

const steps = [];
let failed = false;

function step(name, fn) {
  const startedAt = Date.now();
  try {
    const detail = fn();
    steps.push({ name, ok: true, ms: Date.now() - startedAt, ...(detail ? { detail } : {}) });
    console.log(`  ok   ${name}`);
    return detail;
  } catch (error) {
    failed = true;
    steps.push({ name, ok: false, ms: Date.now() - startedAt, error: error.message });
    console.error(`  FAIL ${name}: ${error.message}`);
    throw error;
  }
}

function run(command, argv, options = {}) {
  const result = spawnSync(command, argv, { encoding: 'utf8', ...options });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(
      `${command} ${argv.slice(0, 3).join(' ')} exited ${result.status}: ${(result.stderr || '').trim().slice(0, 400)}`,
    );
  }
  return result;
}

function cleanup() {
  run('docker', ['rm', '-f', drillContainer], { allowFailure: true });
}

console.log('PolyCost restore drill');
console.log(`  source:  ${sourceContainer}/${database} (read-only)`);
console.log(`  target:  a fresh, empty ${drillContainer} cluster\n`);

try {
  cleanup();

  const before = step('fingerprint the source database', () =>
    JSON.parse(run('node', ['scripts/db-fingerprint.mjs', '--container', sourceContainer]).stdout),
  );

  const backup = step('take a backup (database + cluster globals)', () => {
    const output = run('node', [
      'scripts/db-backup.mjs',
      '--container',
      sourceContainer,
      '--out',
      '.restore-drill',
    ]).stdout;
    const line = output.trim().split('\n').at(-1);
    return JSON.parse(line);
  });

  step('start an empty Postgres cluster', () => {
    // Same image as production compose. A drill against a different version
    // would not prove the dump is loadable by the version actually deployed.
    run('docker', [
      'run',
      '-d',
      '--name',
      drillContainer,
      '-e',
      'POSTGRES_PASSWORD=drill',
      '-e',
      `POSTGRES_USER=${owner}`,
      '-e',
      'POSTGRES_DB=postgres',
      '-p',
      `${drillPort}:5432`,
      'postgres:16-alpine',
    ]);

    for (let attempt = 0; attempt < 60; attempt += 1) {
      const ready = run('docker', ['exec', drillContainer, 'pg_isready', '-U', owner], {
        allowFailure: true,
      });
      if (ready.status === 0) {
        return { attempts: attempt + 1 };
      }
      run('sleep', ['1']);
    }

    throw new Error('the drill cluster never became ready');
  });

  step('restore cluster globals (roles)', () => {
    const sql = readFileSync(backup.globals, 'utf8');
    const result = spawnSync(
      'docker',
      ['exec', '-i', drillContainer, 'psql', '-U', owner, '-d', 'postgres'],
      { input: sql, encoding: 'utf8' },
    );

    // Restoring globals into a cluster that already has the bootstrap superuser
    // reports a duplicate for that one role. Anything else is a real failure.
    const fatal = (result.stderr || '')
      .split('\n')
      .filter((line) => line.includes('ERROR'))
      .filter((line) => !line.includes('already exists'));

    if (fatal.length > 0) {
      throw new Error(fatal.slice(0, 3).join(' | '));
    }
  });

  step('create the target database', () => {
    run('docker', [
      'exec',
      drillContainer,
      'psql',
      '-U',
      owner,
      '-d',
      'postgres',
      '-c',
      `CREATE DATABASE ${database} OWNER ${owner}`,
    ]);
  });

  step('restore the database', () => {
    const dump = readFileSync(backup.dump);
    const result = spawnSync(
      'docker',
      ['exec', '-i', drillContainer, 'pg_restore', '-U', owner, '-d', database, '--no-owner'],
      { input: dump, encoding: 'buffer' },
    );

    const stderr = result.stderr?.toString() ?? '';
    if (result.status !== 0) {
      throw new Error(stderr.trim().split('\n').slice(0, 3).join(' | '));
    }
    return { warnings: stderr.split('\n').filter((l) => l.includes('warning')).length };
  });

  const after = step('fingerprint the restored database', () =>
    JSON.parse(run('node', ['scripts/db-fingerprint.mjs', '--container', drillContainer]).stdout),
  );

  const differences = step('compare the two fingerprints', () => compare(before, after));

  mkdirSync(evidenceDir, { recursive: true });
  const reportPath = path.join(evidenceDir, 'restore-drill-report.json');
  writeFileSync(
    reportPath,
    `${JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        source: `${sourceContainer}/${database}`,
        passed: differences.length === 0,
        steps,
        differences,
        rowsVerified: Object.values(before.tables).reduce((sum, n) => sum + n, 0),
        tablesVerified: Object.keys(before.tables).length,
      },
      null,
      2,
    )}\n`,
  );

  console.log(`\nEvidence written to ${path.relative(process.cwd(), reportPath)}`);

  if (differences.length > 0) {
    console.error(`\nRestore drill FAILED - ${differences.length} difference(s):`);
    for (const difference of differences.slice(0, 30)) {
      console.error(`  - ${difference}`);
    }
    process.exitCode = 1;
  } else {
    const rows = Object.values(before.tables).reduce((sum, n) => sum + n, 0);
    console.log(
      `\nRestore drill PASSED: ${Object.keys(before.tables).length} tables, ${rows} rows, ` +
        `${before.indexes.length} indexes and ${before.roles.roles.length} roles all matched.`,
    );
  }
} catch {
  console.error('\nRestore drill FAILED - see the step above.');
  process.exitCode = 1;
} finally {
  if (!args.keep) {
    cleanup();
  } else {
    console.log(`\nDrill cluster kept as ${drillContainer} on port ${drillPort}.`);
  }
}

function compare(before, after) {
  const differences = [];

  for (const [table, count] of Object.entries(before.tables)) {
    if (after.tables[table] === undefined) {
      differences.push(`table missing after restore: ${table}`);
    } else if (after.tables[table] !== count) {
      differences.push(`${table}: ${count} rows before, ${after.tables[table]} after`);
    }
  }

  for (const [sequence, value] of Object.entries(before.sequences)) {
    if (after.sequences[sequence] !== value) {
      // A sequence behind its table causes primary-key collisions on the next
      // insert, long after the restore looks successful.
      differences.push(
        `sequence ${sequence}: ${value} before, ${after.sequences[sequence] ?? 'missing'} after`,
      );
    }
  }

  for (const [type, count] of Object.entries(before.constraints)) {
    if (after.constraints[type] !== count) {
      differences.push(
        `constraints of type '${type}': ${count} before, ${after.constraints[type] ?? 0} after`,
      );
    }
  }

  const missingIndexes = before.indexes.filter((name) => !after.indexes.includes(name));
  if (missingIndexes.length > 0) {
    differences.push(`indexes missing after restore: ${missingIndexes.join(', ')}`);
  }

  const missingRoles = before.roles.roles.filter((role) => !after.roles.roles.includes(role));
  if (missingRoles.length > 0) {
    differences.push(`cluster roles missing after restore: ${missingRoles.join(', ')}`);
  }

  for (const [table, hash] of Object.entries(before.contentHashes)) {
    if (after.contentHashes[table] !== hash) {
      differences.push(`content hash differs for ${table}`);
    }
  }

  return differences;
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--keep') {
      parsed.keep = true;
    } else if (argv[i].startsWith('--')) {
      parsed[argv[i].slice(2)] = argv[i + 1];
      i += 1;
    }
  }
  return parsed;
}
