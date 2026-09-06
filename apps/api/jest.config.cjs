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
  },
};
