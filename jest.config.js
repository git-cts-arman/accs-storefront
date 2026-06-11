/**
 * Jest configuration for storefront block unit tests.
 * Managed by Storm CLI — copied here from templates/jest.storefront.config.js.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.js$': ['babel-jest', {
      presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
    }],
  },
  moduleNameMapper: {
    '^@dropins/(.*)$': '<rootDir>/../node_modules/@dropins/$1',
  },
  collectCoverageFrom: [
    'blocks/**/*.js',
    '!blocks/**/__tests__/**',
    '!blocks/**/*.test.js',
  ],
  coverageReporters: ['text', 'lcov'],
  testMatch: ['**/blocks/**/__tests__/**/*.test.js'],
};
