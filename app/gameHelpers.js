(function () {
  const { replaceMessageVariables } = typeof module !== 'undefined' && module.exports
    ? require('../shared/messageUtils')
    : window.messageUtils;

  /**
   * Calculate total cargo mass from a cargo object and goods data.
   * Passengers are counted at 10 people per metric ton.
   * @param {Object} cargo - Map of good names to quantities.
   * @param {Object} goodsData - Goods data definitions including finishedMass.
   * @returns {number} Total cargo mass in metric tons.
   */
  function calculateCargoMass(cargo, goodsData) {
    let cargoUsed = 0;

    for (const [goodName, quantity] of Object.entries(cargo)) {
      if (goodName === 'passengers') continue;
      const good = goodsData[goodName];
      if (good && good.finishedMass) {
        const mass = good.finishedMass.mass;
        const units = good.finishedMass.units;
        if (units === 'metric tons') {
          cargoUsed += mass * quantity;
        } else if (units === 'kilograms') {
          cargoUsed += (mass * quantity) / 1000;
        }
      }
    }

    if (cargo.passengers) {
      cargoUsed += cargo.passengers / 10;
    }

    return cargoUsed;
  }

  /**
   * Load an HTML template file and return its text contents.
   * @param {string} templatePath - Relative template path.
   * @returns {Promise<string>} Template HTML as text.
   */
  async function loadTemplate(templatePath) {
    const response = await fetch(templatePath);
    if (!response.ok) {
      throw new Error(`Failed to load template: ${templatePath}`);
    }
    return response.text();
  }

  /**
   * Load a modal's label map: element id to message key.
   *
   * These maps live beside their modal in `app/modals/` rather than inline in a
   * renderer module, so adding a label to a modal is a change to that modal's
   * own files and the manager does not grow a line per label.
   * @param {string} labelsPath - Path to the modal's `.labels.json`.
   * @returns {Promise<Object>} Map of element id to message key.
   * @throws {Error} When the file cannot be loaded.
   * @example
   * const labels = await window.gameHelpers.loadLabelMap('./modals/exchange.labels.json');
   */
  async function loadLabelMap(labelsPath) {
    const response = await fetch(labelsPath);
    if (!response.ok) {
      throw new Error(`Failed to load labels: ${labelsPath}`);
    }
    return response.json();
  }

  /**
   * Apply a modal's label map to the document.
   *
   * An element named in the map but absent from the DOM is skipped rather than
   * treated as an error, because a modal may legitimately render only part of
   * itself, such as a tab that has not been opened yet.
   * @param {Object} labels - Map of element id to message key.
   * @param {Function} resolveText - `(messageKey) => Promise<string>`.
   * @param {Document|HTMLElement} [root=document] - Where to look for elements.
   * @returns {Promise<void>} Resolves once every present element is labelled.
   * @example
   * await window.gameHelpers.applyLabelMap(labels, resolveMessageText);
   */
  async function applyLabelMap(labels, resolveText, root = document) {
    await Promise.all(Object.entries(labels || {}).map(async ([elementId, messageKey]) => {
      const element = root.getElementById
        ? root.getElementById(elementId)
        : root.querySelector(`#${elementId}`);
      if (element) {
        element.textContent = await resolveText(messageKey);
      }
    }));
  }

  /**
   * Log renderer errors through window.logger when available.
   * Falls back to console.error when logger bridge is unavailable.
   * @param {string} message - Error message prefix.
   * @param {*} error - Error payload.
   * @returns {void}
   * @example
   * window.gameHelpers.logClientError('Error opening load game dialog:', error);
   */
  function logClientError(message, error) {
    if (typeof window !== 'undefined' && window.logger && typeof window.logger.error === 'function') {
      window.logger.error(message, error);
    } else {
      console.error(message, error);
    }
  }

  const api = {
    calculateCargoMass,
    replaceMessageVariables,
    loadTemplate,
    loadLabelMap,
    applyLabelMap,
    logClientError
  };

  if (typeof window !== 'undefined') {
    window.gameHelpers = api;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
