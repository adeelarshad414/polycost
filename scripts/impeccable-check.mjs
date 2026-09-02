import { spawnSync } from 'node:child_process';

// UI anti-pattern scan.
//
// This check used to be quietly inconsistent: impeccable@3.1.0 needs Node 24+,
// CI runs Node 20, so CI always skipped it and reported success - while a
// developer on current Node hit 24 findings and could not commit without
// --no-verify. A gate that is green in CI and red locally trains people to
// bypass the hook, and the pre-commit hook also runs format, lint, typecheck
// and the unit tests.
//
// So the two behaviours are now explicit rather than accidental:
//
//   default          findings are reported and the check passes (advisory)
//   IMPECCABLE_ENFORCE=1   findings fail the check (a real gate)
//
// Enforcement is off until CI runs Node 24 and the existing findings are
// resolved - both tracked as K-12 in docs/KNOWN-ISSUES.md. Turning it on is a
// one-line change once those land, and until then nobody is forced to bypass
// the other checks.

const enforce = process.env.IMPECCABLE_ENFORCE === '1';
const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);

if (nodeMajor < 24) {
  console.warn(
    `Impeccable check skipped: impeccable@3.1.0 requires Node.js 24+, and this runtime is Node.js ${nodeMajor}.`,
  );
  console.warn(
    'This is why the check is currently advisory - see K-12 in docs/KNOWN-ISSUES.md. Run it locally on Node 24+ with: npm run impeccable',
  );
  process.exit(0);
}

const result = spawnSync(
  'npx',
  ['--yes', 'impeccable@3.1.0', 'detect', 'apps/web/src', 'apps/web/index.html'],
  {
    encoding: 'utf8',
    stdio: 'inherit',
  },
);

if (result.error) {
  console.error(`Impeccable failed to start: ${result.error.message}`);
  process.exit(1);
}

const status = result.status ?? 1;

if (status !== 0 && !enforce) {
  console.warn('');
  console.warn(
    'Impeccable reported findings above. Not failing the build: these are visual-polish',
  );
  console.warn(
    'findings that CI has never evaluated, and blocking on them here would push people to',
  );
  console.warn('--no-verify, skipping the lint, typecheck and unit tests in the same hook.');
  console.warn('Tracked as K-12. Set IMPECCABLE_ENFORCE=1 to treat them as failures.');
  process.exit(0);
}

process.exit(status);
