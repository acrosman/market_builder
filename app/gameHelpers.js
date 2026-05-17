(function () {
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
   * Replace {token} variables in a message string.
   * Unmatched tokens are left as-is in the output.
   * @param {string} message - Message template with {variable} tokens.
   * @param {Object} vars - Map of variable names to replacement values.
   * @returns {string} Message with variables replaced.
   */
  function replaceMessageVariables(message, vars) {
    return message.replace(/\{(\w+)\}/g, (match, variable) => {
      return vars[variable] !== undefined ? vars[variable] : match;
    });
  }

  const api = {
    calculateCargoMass,
    replaceMessageVariables
  };

  if (typeof window !== 'undefined') {
    window.gameHelpers = api;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
