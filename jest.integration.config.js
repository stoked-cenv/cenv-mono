const baseConfig = require('./jest.config');
module.exports = {
  ...baseConfig,
  testMatch: ['<rootDir>/integration/**/*.spec.ts'],
  collectCoverage: true,
  verbose: true,
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json',
    },
  },
  moduleNameMapper: {
    '^@stoked-cenv/lib$': ['<rootDir>/packages/lib/src'],
    '^@stoked-cenv/ui$': ['<rootDir>/packages/ui/src'],
    '^@stoked-cenv/cli$': ['<rootDir>/packages/cli/src'],
    '^@stoked-cenv/cdk$': ['<rootDir>/packages/cdk/core']
  },
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
};
