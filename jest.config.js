module.exports = {
  projects: [
    {
      displayName: 'node',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/**/*.test.js', '<rootDir>/main.test.js']
    },
    {
      displayName: 'jsdom',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/app/**/*.test.js'],
      setupFilesAfterEnv: ['<rootDir>/jest.setup.js']
    }
  ],
  collectCoverageFrom: [
    'app/**/*.js',
    'src/**/*.js',
    '!**/node_modules/**',
    '!**/vendor/**'
  ]
};
