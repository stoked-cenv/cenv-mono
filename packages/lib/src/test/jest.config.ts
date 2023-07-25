import type {Config} from '@jest/types';
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

const baseConfig: Config.InitialOptions = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  roots: ['../../../cli/src/test'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  testEnvironment: 'node',
  collectCoverageFrom: ['packages/**/src/*.ts'],
  collectCoverage: true,
};

export default baseConfig;