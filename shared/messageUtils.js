(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
    return;
  }

  root.messageUtils = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  /**
   * Replace {token} variables in a message string.
   * Unmatched tokens are left as-is in the output.
   * @param {string} message - Message template with {variable} tokens.
   * @param {Object} [vars={}] - Map of variable names to replacement values.
   * @returns {string|null} Message with variables replaced, or null for invalid input.
   * @example
   * const text = replaceMessageVariables('Hello {name}!', { name: 'Captain' });
   */
  function replaceMessageVariables(message, vars = {}) {
    if (typeof message !== 'string') {
      return null;
    }

    return message.replace(/\{(\w+)\}/g, (match, variable) => {
      if (Object.prototype.hasOwnProperty.call(vars, variable)) {
        const replacementValue = vars[variable];
        if (replacementValue === null || replacementValue === undefined) {
          return match;
        }
        return String(replacementValue);
      }
      return match;
    });
  }

  return {
    replaceMessageVariables
  };
});
