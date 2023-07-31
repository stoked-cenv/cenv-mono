module.exports = {
    extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
    parser: '@typescript-eslint/parser',
    parserOptions: {
        project: '**/tsconfig.build.json',
        tsconfigRootDir : `${__dirname}`,
        sourceType: 'module',
        ecmaFeatures: {
            experimentalDecorators: true,
            jsx: true,
            tsx: true
        },
    },
    plugins: ['@typescript-eslint'],
    root: true,
    rules: {
        '@typescript-eslint/interface-name-prefix': 'off',
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-var-requires': 'off',
        '@typescript-eslint/no-control-regex': 0,
        '@typescript-eslint/no-fallthrough': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
        'no-useless-escape': 'off',
        '@typescript-eslint/ban-ts-comment': 'off',
        '@typescript-eslint/no-namespace': 'off'
    },
    env: {
        node: true,
        jest: true,
    }
};