const electronLog = require('electron-log');

/**
 * Configure the shared electron-log instance.
 * @param {Object} [options={}] - Logger configuration options.
 * @param {boolean} [options.isDevelopment=false] - Enable debug-level logging when true.
 * @returns {Object} The configured electron-log instance.
 */
function configureLogger(options = {}) {
  const { isDevelopment = false } = options;

  try {
    if (!electronLog.transports?.file || !electronLog.transports?.console) {
      throw new Error('electron-log transports are unavailable');
    }

    const level = isDevelopment ? 'debug' : 'info';
    electronLog.transports.file.level = level;
    electronLog.transports.console.level = level;
    electronLog.transports.file.maxSize = 5 * 1024 * 1024;
    electronLog.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
    electronLog.transports.console.format = '[{h}:{i}:{s}.{ms}] [{level}] {text}';

    return electronLog;
  } catch (error) {
    throw new Error(`Failed to initialize logger: ${error.message}`);
  }
}

/**
 * Create a scoped logger that prefixes each line with the scope.
 * @param {string} scope - Logical scope for this logger (module/class name).
 * @returns {Object} Logger methods for debug/info/warn/error.
 */
function createLogger(scope) {
  const scopeTag = `[${scope}]`;

  return {
    debug: (...args) => electronLog.debug(scopeTag, ...args),
    info: (...args) => electronLog.info(scopeTag, ...args),
    warn: (...args) => electronLog.warn(scopeTag, ...args),
    error: (...args) => electronLog.error(scopeTag, ...args)
  };
}

/**
 * Validate and normalize renderer logger scope.
 * @param {unknown} scope - The scope provided by renderer log payload.
 * @returns {string|null} The normalized scope if valid, otherwise null.
 */
function normalizeRendererLogScope(scope) {
  if (typeof scope !== 'string') {
    return null;
  }

  const normalizedScope = scope.trim();
  if (normalizedScope.length === 0 || normalizedScope.length > 50) {
    return null;
  }

  if (!/^[a-zA-Z0-9._-]+$/.test(normalizedScope)) {
    return null;
  }

  return normalizedScope;
}

module.exports = {
  configureLogger,
  createLogger,
  normalizeRendererLogScope
};
