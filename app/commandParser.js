(function () {
  /**
   * Normalize command text for matching.
   * @param {string} text - Raw command input.
   * @returns {string} Lower-cased command with collapsed whitespace.
   */
  function normalizeCommandText(text) {
    return (text || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  /**
   * Parse a numeric-only system command.
   * @param {string} command - Normalized command.
   * @returns {number|null} Parsed system id, or null if not numeric.
   */
  function parseNumericSystemId(command) {
    if (!/^\d+$/.test(command)) {
      return null;
    }

    const parsed = parseInt(command, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }

  /**
   * Parse "jump N" command into a system id.
   * @param {string} command - Normalized command.
   * @returns {number|null} Destination system id, or null when not matched.
   */
  function parseJumpSystemId(command) {
    const jumpMatch = command.match(/^jump\s+(\d+)$/);
    if (!jumpMatch) {
      return null;
    }

    const parsed = parseInt(jumpMatch[1], 10);
    return Number.isNaN(parsed) ? null : parsed;
  }

  /**
   * Apply shortcut aliases to a normalized command.
   * @param {string} command - Normalized command.
   * @param {Object<string,string>} aliases - Alias map.
   * @returns {string} Canonical command.
   */
  function applyAlias(command, aliases) {
    if (!command) {
      return command;
    }

    return aliases[command] || command;
  }

  /**
   * Resolve one-word command using unique first-word matching.
   * @param {string} command - Normalized command.
   * @param {string[]} labels - Button labels.
   * @returns {string|null} Matched label, or null when ambiguous/unmatched.
   */
  function resolveUniqueFirstWord(command, labels) {
    if (!command || command.includes(' ')) {
      return null;
    }

    const normalizedLabels = labels
      .map(label => normalizeCommandText(label))
      .filter(label => label.includes(' '));

    const firstWordCounts = new Map();
    normalizedLabels.forEach(label => {
      const firstWord = label.split(' ')[0];
      firstWordCounts.set(firstWord, (firstWordCounts.get(firstWord) || 0) + 1);
    });

    const matches = normalizedLabels.filter(label => label.startsWith(`${command} `));
    if (matches.length !== 1) {
      return null;
    }

    const matchedFirstWord = matches[0].split(' ')[0];
    if (firstWordCounts.get(matchedFirstWord) !== 1) {
      return null;
    }

    return matches[0];
  }

  const api = {
    normalizeCommandText,
    parseNumericSystemId,
    parseJumpSystemId,
    applyAlias,
    resolveUniqueFirstWord
  };

  if (typeof window !== 'undefined') {
    window.commandParser = api;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
