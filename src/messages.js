const fs = require('fs');
const path = require('path');

/**
 * Replace message template variables with provided values.
 * @param {string} message - Message template containing {tokens}
 * @param {Object} [vars={}] - Replacement values keyed by token name
 * @returns {string|null} Localized message text, or null for invalid input
 * @example
 * const text = replaceMessageVariables('Need {required}, have {available}', { required: 10, available: 5 });
 */
function replaceMessageVariables(message, vars = {}) {
  if (typeof message !== 'string') {
    return null;
  }

  return message.replace(/\{(\w+)\}/g, (match, variableName) => {
    if (Object.prototype.hasOwnProperty.call(vars, variableName)) {
      return String(vars[variableName]);
    }
    return match;
  });
}

/**
 * Load a localized message string from the configured data directory.
 * @param {string} dataDir - Data directory path (for example data/default/en-us)
 * @param {string} messageKey - Dot-delimited message key
 * @param {Object} [vars={}] - Replacement values keyed by token name
 * @returns {string|null} Localized message text, or null when unavailable
 * @example
 * const text = getLocalizedMessage('data/default/en-us', 'construction.reasons.no_active_game');
 */
function getLocalizedMessage(dataDir, messageKey, vars = {}) {
  if (!dataDir || !messageKey) {
    return null;
  }

  try {
    const messagesPath = path.join(__dirname, '..', dataDir, 'game_messages.json');
    const messagesData = JSON.parse(fs.readFileSync(messagesPath, 'utf-8'));
    const keys = messageKey.split('.');
    let result = messagesData;

    for (const key of keys) {
      if (result && typeof result === 'object' && key in result) {
        result = result[key];
      } else {
        return null;
      }
    }

    return replaceMessageVariables(result, vars);
  } catch (error) {
    return null;
  }
}

module.exports = {
  getLocalizedMessage,
  replaceMessageVariables
};
