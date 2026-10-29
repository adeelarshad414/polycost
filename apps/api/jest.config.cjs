// Per-file floor as [statements, branches, functions, lines].
const floor = ([statements, branches, functions, lines]) => ({
  statements,
  branches,
  functions,
  lines,
});

// Audit H-11: the code that guards accounts and money, and the adapters that
// fetch prices, may not lose coverage silently behind the global average. Each
// floor is today's figure rounded down, so it only ratchets: raise it when a
// test lands, never lower it to make a change pass. Controllers are thin and
// covered by the e2e suite, so they are not listed.
const CRITICAL_FILE_FLOORS = {
  './src/api/auth.service.ts': [83, 66, 93, 83],
  './src/api/auth.controller.ts': [98, 80, 100, 98],
  // Branches: the decorator metadata TypeScript emits, not code paths.
  './src/api/session-auth.guard.ts': [100, 75, 100, 100],
  './src/api/session-cookie.ts': [100, 91, 100, 100],
  './src/api/password-hash.ts': [92, 80, 100, 92],
  './src/api/admin-api-key.guard.ts': [100, 90, 100, 100],
  './src/api/resource-access.service.ts': [92, 88, 84, 93],
  './src/api/team-domains.ts': [100, 94, 100, 100],
  './src/api/team-domains.service.ts': [89, 84, 100, 89],
  './src/api/scim-provisioning.service.ts': [73, 68, 83, 72],
  './src/api/billing.service.ts': [86, 71, 97, 86],
  './src/money.ts': [100, 100, 100, 100],
  './src/adapters/common/base-cloud-provider.adapter.ts': [92, 87, 100, 92],
  './src/adapters/common/http-client.ts': [85, 82, 85, 86],
  './src/adapters/common/circuit-breaker.ts': [100, 100, 100, 100],
  './src/adapters/aws/aws-provider.adapter.ts': [90, 71, 100, 90],
  './src/adapters/aws/aws-signature-v4.ts': [100, 50, 100, 100],
  './src/adapters/azure/azure-provider.adapter.ts': [87, 70, 100, 87],
  './src/adapters/gcp/gcp-provider.adapter.ts': [94, 75, 92, 95],
};

module.exports = {
  // The ESM preset, because apps/api is now "type": "module". Requires
  // node --experimental-vm-modules, which the test scripts pass.
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  // Relative imports now carry the .js extension that Node ESM requires. At
  // test time the files on disk are still .ts, so the extension is stripped
  // back off before resolution. This mapping is also exactly what the ESM
  // preset needs later, so it does not change again at the flip.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',
    '!src/app.module.ts',
    '!src/**/*.module.ts',
    '!src/healthcheck.ts',
    '!src/**/*.spec.ts',
    '!src/testing/**',
  ],
  coverageDirectory: '../../coverage/api',
  coverageThreshold: {
    global: {
      branches: 67,
      functions: 85,
      lines: 85,
      statements: 85,
    },
    './src/cost-time.ts': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
    './src/nws/nws-validator.ts': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
    './src/comparison/interval-cost-calculator.ts': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
    './src/reports/csv-report.generator.ts': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85,
    },
    './src/reports/excel-report.generator.ts': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85,
    },
    './src/reports/pdf-report.generator.ts': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85,
    },
    ...Object.fromEntries(
      Object.entries(CRITICAL_FILE_FLOORS).map(([file, floors]) => [file, floor(floors)]),
    ),
  },
};
