module.exports = {
    displayName: 'core',
    preset: '../../jest.preset.js',
    transform: {
        '^.+\\.(ts|tsx)?$': ['ts-jest',{
            tsconfig: '<rootDir>/tsconfig.spec.json',
            diagnostics: false,
        }],
        '\\.(gif|png|jpe?g|svg)$': '../../scripts/jest/file-transformer',
        '\\.scss$': '../../scripts/jest/style-transformer',
        // @faker-js/faker 10 is ESM-only; compile it to CommonJS for Jest.
        'node_modules/@faker-js/faker/.+\\.js$': [
            'babel-jest',
            { presets: [['@babel/preset-env', { targets: { node: 'current' } }]] },
        ],
    },
    transformIgnorePatterns: ['/node_modules/(?!@faker-js/faker/)'],
    setupFilesAfterEnv: ['../../jest-setup.ts'],
    coverageDirectory: '../../coverage/packages/core'
};
