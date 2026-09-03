#!/usr/bin/env node
// Captures a structural and content fingerprint of a PolyCost database, so a
// restore can be compared against the original rather than eyeballed.
//
// "The restore ran without errors" is not evidence. These are the things that
// come back wrong quietly:
//
//   row counts      the obvious one, and the only one most drills check
//   sequences       restored at the wrong value means primary-key collisions
//                   on the next insert - hours later, looking unrelated
//   constraints     a missing FK or CHECK lets bad data in from then on
//   indexes         everything works, just slowly, until it times out
//   roles + grants  pg_dump omits cluster roles entirely (see db-backup.mjs)
//   content hashes  row counts match while the rows themselves are wrong
//
// Output is deterministic JSON so two runs can be diffed directly.
import { spawnSync } from 'node:child_process';

const args = parseArgs(process.argv.slice(2));
const container = args.container ?? 'polycost-postgres-1';
const database = args.database ?? 'polycost_dev';
const owner = args.owner ?? 'polycost_owner';

// Tables whose contents are hashed, not just counted. Chosen because a silent
// corruption here is either a compliance problem or a money problem: invoice
// artefacts are WORM records under legal hold, and the audit outbox is what
// proves an audit event was delivered.
const CONTENT_HASHED_TABLES = [
  'invoice_artifact_blobs',
  'team_audit_events',
  'team_audit_export_outbox',
  'comparison_audit',
  'pricing_rates',
];

const fingerprint = {
  tables: rowCounts(),
  sequences: sequenceValues(),
  constraints: constraintCounts(),
  indexes: indexNames(),
  roles: roleGrants(),
  contentHashes: contentHashes(),
};

console.log(JSON.stringify(fingerprint, null, 2));

function psql(sql) {
  const result = spawnSync(
    'docker',
    ['exec', '-i', container, 'psql', '-U', owner, '-d', database, '-At', '-F', '', '-c', sql],
    { encoding: 'utf8' },
  );

  if (result.status !== 0) {
    console.error(`psql failed: ${result.stderr}`);
    process.exit(1);
  }

  return result.stdout
    .trim()
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => line.split(''));
}

function rowCounts() {
  // Counted per table with a real COUNT(*), not reltuples: the planner estimate
  // is approximate and would mask a partial restore.
  const tables = psql(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `).map(([name]) => name);

  const counts = {};
  for (const table of tables) {
    const [[count]] = psql(`SELECT count(*) FROM public."${table}"`);
    counts[table] = Number(count);
  }

  return counts;
}

function sequenceValues() {
  const rows = psql(`
    SELECT sequencename, COALESCE(last_value::text, 'unused')
    FROM pg_sequences WHERE schemaname = 'public' ORDER BY sequencename
  `);

  return Object.fromEntries(rows);
}

function constraintCounts() {
  const rows = psql(`
    SELECT contype, count(*)::text FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public' GROUP BY contype ORDER BY contype
  `);

  // p primary key, f foreign key, u unique, c check, x exclusion
  return Object.fromEntries(rows.map(([type, count]) => [type, Number(count)]));
}

function indexNames() {
  return psql(`
    SELECT indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname
  `).map(([name]) => name);
}

function roleGrants() {
  const roles = psql(`
    SELECT rolname FROM pg_roles WHERE rolname LIKE 'polycost%' ORDER BY rolname
  `).map(([name]) => name);

  const grants = psql(`
    SELECT grantee || ':' || privilege_type, count(*)::text
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND grantee LIKE 'polycost%'
    GROUP BY 1 ORDER BY 1
  `);

  return { roles, grants: Object.fromEntries(grants.map(([key, n]) => [key, Number(n)])) };
}

function contentHashes() {
  const hashes = {};

  for (const table of CONTENT_HASHED_TABLES) {
    const [[exists]] = psql(`SELECT to_regclass('public.${table}') IS NOT NULL`);
    if (exists !== 't') {
      continue;
    }

    // Hash the whole row rather than named columns so a schema change cannot
    // silently narrow what is being verified. Ordered by ctid-independent text
    // so the hash does not depend on physical row order, which a restore
    // legitimately changes.
    const [[hash]] = psql(`
      SELECT COALESCE(md5(string_agg(row_hash, '' ORDER BY row_hash)), 'empty')
      FROM (SELECT md5(t::text) AS row_hash FROM public."${table}" t) rows
    `);
    hashes[table] = hash;
  }

  return hashes;
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) {
      parsed[argv[i].slice(2)] = argv[i + 1];
      i += 1;
    }
  }
  return parsed;
}
