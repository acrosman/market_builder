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
    logClientError
  };

  if (typeof window !== 'undefined') {
    window.gameHelpers = api;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
