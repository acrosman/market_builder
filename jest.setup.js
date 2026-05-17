// Jest setup file for DOM-related tests
// This file runs before each test file

// Polyfill for TextEncoder/TextDecoder if needed
if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = require('util').TextEncoder;
}

if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = require('util').TextDecoder;
}

beforeEach(() => {
  if (typeof window !== 'undefined') {
    window.logger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
  }
});
