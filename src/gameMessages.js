const fs = require('fs');
const path = require('path');
const { replaceMessageVariables } = require('../shared/messageUtils');

const gameMessagesCache = new Map();

/**
 * Load game messages data, optionally by nested dot-notation key.
 * @param {string} dataDir - Data directory containing game_messages.json
 * @param {string} [messageKey] - Optional nested message key
 * @param {Object} [options={}] - Optional loader settings
 * @param {string} [options.baseDir] - Repository base directory
 * @param {Object} [options.logger] - Optional logger with an error method
 * @returns {Object|string|null} Message object, string, or null when missing
 * @example
 * const text = getGameMessages('data/default/en-us', 'construction.reasons.no_active_game');
 */
function getGameMessages(dataDir, messageKey, options = {}) {
  const {
    baseDir = path.join(__dirname, '..'),
    logger = null
  } = options;

  try {
    const messagesPath = path.join(baseDir, dataDir, 'game_messages.json');
    let messagesData = gameMessagesCache.get(messagesPath);
    if (!messagesData) {
      messagesData = JSON.parse(fs.readFileSync(messagesPath, 'utf-8'));
      gameMessagesCache.set(messagesPath, messagesData);
    }

    if (!messageKey) {
      return messagesData;
    }

    const keys = messageKey.split('.');
    let result = messagesData;

    for (const key of keys) {
      if (result && typeof result === 'object' && key in result) {
        result = result[key];
      } else {
        return null;
      }
    }

    return result;
  } catch (error) {
    if (logger && typeof logger.error === 'function') {
      logger.error('Error loading game messages:', error);
    }
    return null;
  }
}

/**
 * Resolve a localized game message string with token replacement.
 * @param {string} dataDir - Data directory containing game_messages.json
 * @param {string} messageKey - Dot-delimited message key from game_messages.json
 * @param {Object} [vars={}] - Template variables for replacement
 * @param {string} [fallback=''] - Fallback English message when lookup fails
 * @param {Object} [options={}] - Optional loader settings
 * @returns {string} Localized message text
 * @example
 * const text = getLocalizedGameMessage('data/default/en-us', 'construction.reasons.not_controlled', {}, 'You do not control this stellar object');
 */
function getLocalizedGameMessage(dataDir, messageKey, vars = {}, fallback = '', options = {}) {
  const message = getGameMessages(dataDir, messageKey, options);
  if (message === null) {
    return fallback;
  }

  const localizedMessage = replaceMessageVariables(message, vars);
  return localizedMessage === null ? fallback : localizedMessage;
}

module.exports = {
  getGameMessages,
  getLocalizedGameMessage
};
