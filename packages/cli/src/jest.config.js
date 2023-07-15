const baseConfig = {
    roots: ['./'],
    rootDir: './',
    preset: 'ts-jest',
    reporters: ['default'],
    clearMocks: true,
    silent: false,
    coverageThreshold: {
        global: {
            statements: 100,
            branches: 100,
            functions: 100,
            lines: 100,
        },
    },
    setupFilesAfterEnv: ['./test/customConsole.ts']
};
export default baseConfig;
