/** @type {import('ts-jest/dist').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest/presets/js-with-ts',
  testEnvironment: 'node',
  transform: {
    "^.e2e-spec.ts?$": "ts-jest",
    "^.spec.ts?$": "ts-jest"
  },
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json'
    }
  }
};
