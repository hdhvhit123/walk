/** App-level tests: real screens, real core, real SQL; native edges replaced by fakes. */
module.exports = {
  preset: 'jest-expo/android',
  roots: ['<rootDir>/tests/app'],
  setupFilesAfterEnv: ['<rootDir>/tests/app/setup.ts'],
  testTimeout: 120000,
};
