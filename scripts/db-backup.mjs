#!/usr/bin/env node
// Takes a restorable backup of the PolyCost database.
//
// Two artefacts, not one, and the second is the one people forget:
//
//   <stamp>.globals.sql  cluster-level roles and their passwords
//   <stamp>.dump         the database itself, custom format
//
// pg_dump does not include roles. Migration 002 creates polycost_app and
// polycost_etl as CLUSTER-level roles, so a database-only backup restores every
// table and then leaves the application unable to log in. Restoring into the
// same cluster hides this completely, because the roles are already there -
// which is why scripts/restore-drill.mjs restores into a clean one.
//
// Custom format (-Fc) rather than plain SQL: it is compressed, and pg_restore
// can then run in parallel and be selective if only part of the data is needed.
import { spawnSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import path from 'node:path';

const args = parseArgs(process.argv.slice(2));
const container = args.container ?? 'polycost-postgres-1';
const database = args.database ?? 'polycost_dev';
const owner = args.owner ?? 'polycost_owner';
const outputDir = path.resolve(args.out ?? 'backups');

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dumpPath = path.join(outputDir, `${stamp}.dump`);
const globalsPath = path.join(outputDir, `${stamp}.globals.sql`);

mkdirSync(outputDir, { recursive: true });

// --globals-only gives roles, role passwords and tablespaces; --no-role-passwords
// would strip exactly the part that lets the app reconnect, so it is not used.
writeThroughDocker(
  globalsPath,
  ['exec', '-i', container, 'pg_dumpall', '-U', owner, '--globals-only'],
  'role/globals dump',
);

writeThroughDocker(
  dumpPath,
  ['exec', '-i', container, 'pg_dump', '-U', owner, '-d', database, '-Fc'],
  'database dump',
);

const dumpBytes = statSync(dumpPath).size;
const globalsBytes = statSync(globalsPath).size;

// A dump that "succeeded" but produced almost nothing is the classic silent
// backup failure, so fail loudly rather than archiving an empty file.
if (dumpBytes < 1024) {
  console.error(`Database dump is only ${dumpBytes} bytes - treating as a failed backup.`);
  process.exit(1);
}
if (globalsBytes < 128) {
  console.error(`Globals dump is only ${globalsBytes} bytes - roles are probably missing.`);
  process.exit(1);
}

console.log(`Backup complete:`);
console.log(`  ${dumpPath} (${dumpBytes} bytes)`);
console.log(`  ${globalsPath} (${globalsBytes} bytes)`);
console.log(JSON.stringify({ dump: dumpPath, globals: globalsPath, stamp }));

function writeThroughDocker(target, dockerArgs, label) {
  const result = spawnSync('sh', ['-c', `docker ${dockerArgs.join(' ')} > ${quote(target)}`], {
    encoding: 'utf8',
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  if (result.status !== 0) {
    console.error(`${label} failed with exit code ${result.status}.`);
    process.exit(1);
  }
}

function quote(value) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      parsed[arg.slice(2)] = argv[i + 1];
      i += 1;
    }
  }
  return parsed;
}
