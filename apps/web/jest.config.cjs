module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  // App.spec drives whole-page flows (render, compare, workspace sign-in); on a loaded
  // machine or CI runner they brushed the 5 s default and flaked. 15 s keeps a real hang
  // visible while removing load-dependent failures.
  testTimeout: 15_000,
  roots: ['<rootDir>/src'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/main.tsx', '!src/components/LandingPage.tsx'],
  coverageDirectory: '../../coverage/web',
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    './src/cost-time.ts': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
};
