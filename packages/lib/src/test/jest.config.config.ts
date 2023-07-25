import type {Config} from '@jest/types';
import baseConfig from './jest.config';
/*
const baseConfig: Config.InitialOptions = {
  roots: ['./', '../../../cli/src/test'],
  rootDir: './',
  preset: 'ts-jest',
  reporters: ['default'],
  clearMocks: true,
  silent: false,
  coverageThreshold: {
    global: {
      statements: 100, branches: 100, functions: 100, lines: 100,
    },
  },
  setupFilesAfterEnv: ['./customConsole.js']
}
 */

const configConfig: Config.InitialOptions = {
  ...baseConfig,
  testMatch: ['*.spec.ts'],
  collectCoverage: true,
  verbose: true,
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json',
    },
  },
  moduleNameMapper: {
    '^@stoked-cenv/cli$': ['<rootDir>/packages/cli/src'],
  },
  modulePathIgnorePatterns: ['<rootDir>/packages/cli/dist'],
};

export default configConfig;