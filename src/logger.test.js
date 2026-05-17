jest.mock('electron-log', () => ({
  transports: {
    file: {
      level: 'info',
      maxSize: 0,
      format: ''
    },
    console: {
      level: 'info',
      format: ''
    }
  },
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

const electronLog = require('electron-log');
const { configureLogger, createLogger, normalizeRendererLogScope } = require('./logger');

describe('logger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    electronLog.transports.file.level = 'info';
    electronLog.transports.console.level = 'info';
    electronLog.transports.file.maxSize = 0;
    electronLog.transports.file.format = '';
    electronLog.transports.console.format = '';
  });

  test('configureLogger enables debug level in development', () => {
    configureLogger({ isDevelopment: true });

    expect(electronLog.transports.file.level).toBe('debug');
    expect(electronLog.transports.console.level).toBe('debug');
    expect(electronLog.transports.file.maxSize).toBe(5 * 1024 * 1024);
  });

  test('configureLogger disables debug outside development', () => {
    configureLogger({ isDevelopment: false });

    expect(electronLog.transports.file.level).toBe('info');
    expect(electronLog.transports.console.level).toBe('info');
  });

  test('configureLogger throws when transports are missing', () => {
    const originalTransports = electronLog.transports;
    electronLog.transports = {};

    expect(() => configureLogger({ isDevelopment: true })).toThrow('Failed to initialize logger');

    electronLog.transports = originalTransports;
  });

  test('createLogger prefixes scope for each level', () => {
    const logger = createLogger('TestScope');

    logger.debug('debug message');
    logger.info('info message');
    logger.warn('warn message');
    logger.error('error message');

    expect(electronLog.debug).toHaveBeenCalledWith('[TestScope]', 'debug message');
    expect(electronLog.info).toHaveBeenCalledWith('[TestScope]', 'info message');
    expect(electronLog.warn).toHaveBeenCalledWith('[TestScope]', 'warn message');
    expect(electronLog.error).toHaveBeenCalledWith('[TestScope]', 'error message');
  });

  test('normalizeRendererLogScope accepts valid scopes', () => {
    expect(normalizeRendererLogScope('interface')).toBe('interface');
    expect(normalizeRendererLogScope('ui.modal_manager')).toBe('ui.modal_manager');
  });

  test('normalizeRendererLogScope rejects invalid scope types and lengths', () => {
    expect(normalizeRendererLogScope(42)).toBeNull();
    expect(normalizeRendererLogScope('')).toBeNull();
    expect(normalizeRendererLogScope('x'.repeat(51))).toBeNull();
  });

  test('normalizeRendererLogScope rejects multiline and unsafe content', () => {
    expect(normalizeRendererLogScope('line1\nline2')).toBeNull();
    expect(normalizeRendererLogScope('scope with spaces')).toBeNull();
    expect(normalizeRendererLogScope('scope:colon')).toBeNull();
  });
});
