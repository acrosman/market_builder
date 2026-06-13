/**
 * Represents a Corporation in Universe Market Builder.
 * Corporations own assets (stellar objects, ships, goods) and track their total value.
 */
class Corporation {
  /**
   * Creates a new Corporation
   * @param {string} name - The name of the corporation
   * @param {string} description - Description of the corporation
   * @param {boolean} isPlayerOwned - Whether this corporation is owned by the player
   * @param {number} cashReserves - Initial fungible cash reserves
   */
  constructor(name, description, isPlayerOwned = false, cashReserves = 0) {
    this.name = name;
    this.description = description;
    this.isPlayerOwned = isPlayerOwned;
    this.stellarObjects = []; // Array of stellar object IDs owned by this corporation
    this.ships = []; // Array of ship IDs owned by this corporation
    this.goods = {}; // Object mapping good names to quantities
    this.cashReserves = Corporation.normalizeCashReserves(cashReserves);
    this.dividendRate = 0;
    this.sharesIssued = 0;
    this.loans = [];
    this.nextLoanId = 1;
  }

  /**
   * Convert reserve input to a fungible numeric amount
   * Numeric input is used directly when finite and non-negative.
   * Object input is summed across numeric positive properties.
   * Negative, non-finite, and invalid values are ignored and default to 0.
   * @param {number|Object} cashReserves - Reserve value to normalize
   * @returns {number} Numeric reserve amount
   */
  static normalizeCashReserves(cashReserves) {
    if (typeof cashReserves === 'number' && Number.isFinite(cashReserves) && cashReserves >= 0) {
      return cashReserves;
    }

    if (cashReserves && typeof cashReserves === 'object') {
      const total = Object.values(cashReserves).reduce((sum, amount) => {
        if (typeof amount === 'number' && Number.isFinite(amount) && amount > 0) {
          return sum + amount;
        }
        return sum;
      }, 0);
      return total;
    }

    return 0;
  }

  /**
   * Adds a stellar object to the corporation's assets
   * @param {number} stellarObjectId - The ID of the stellar object to add
   */
  addStellarObject(stellarObjectId) {
    if (!this.stellarObjects.includes(stellarObjectId)) {
      this.stellarObjects.push(stellarObjectId);
    }
  }

  /**
   * Removes a stellar object from the corporation's assets
   * @param {number} stellarObjectId - The ID of the stellar object to remove
   */
  removeStellarObject(stellarObjectId) {
    const index = this.stellarObjects.indexOf(stellarObjectId);
    if (index > -1) {
      this.stellarObjects.splice(index, 1);
    }
  }

  /**
   * Adds a ship to the corporation's assets
   * @param {number} shipId - The ID of the ship to add
   */
  addShip(shipId) {
    if (!this.ships.includes(shipId)) {
      this.ships.push(shipId);
    }
  }

  /**
   * Removes a ship from the corporation's assets
   * @param {number} shipId - The ID of the ship to remove
   */
  removeShip(shipId) {
    const index = this.ships.indexOf(shipId);
    if (index > -1) {
      this.ships.splice(index, 1);
    }
  }

  /**
   * Adds goods to the corporation's inventory
   * @param {string} goodName - The name of the good
   * @param {number} quantity - The quantity to add
   */
  addGoods(goodName, quantity) {
    if (!this.goods[goodName]) {
      this.goods[goodName] = 0;
    }
    this.goods[goodName] += quantity;
  }

  /**
   * Removes goods from the corporation's inventory
   * @param {string} goodName - The name of the good
   * @param {number} quantity - The quantity to remove
   * @returns {boolean} True if successful, false if insufficient quantity
   */
  removeGoods(goodName, quantity) {
    if (!this.goods[goodName] || this.goods[goodName] < quantity) {
      return false;
    }
    this.goods[goodName] -= quantity;
    if (this.goods[goodName] === 0) {
      delete this.goods[goodName];
    }
    return true;
  }

  /**
   * Adds cash to corporation reserves
   * @param {number} amount - Amount to add
   * @returns {boolean} True if successful, false otherwise
   */
  addCashReserve(amount) {
    if (typeof amount !== 'number' || amount <= 0) {
      return false;
    }
    this.cashReserves += amount;
    return true;
  }

  /**
   * Spends cash from corporation reserves
   * @param {number} amount - Amount to spend
   * @returns {boolean} True if successful, false when insufficient funds or invalid input
   */
  spendCashReserve(amount) {
    if (
      typeof amount !== 'number' ||
      amount <= 0 ||
      this.cashReserves < amount
    ) {
      return false;
    }
    this.cashReserves -= amount;
    return true;
  }

  /**
   * Gets total corporation fungible cash reserves
   * @returns {number} Total reserve amount
   */
  getTotalCashReserves() {
    return this.cashReserves;
  }

  /**
   * Set the corporation's dividend payout rate.
   * @param {number} rate - Dividend rate percentage from 0 to 100.
   * @returns {boolean} True when updated, false for invalid values.
   */
  setDividendRate(rate) {
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate > 100) {
      return false;
    }
    this.dividendRate = rate;
    return true;
  }

  /**
   * Issue additional stock shares.
   * @param {number} count - Number of shares to issue.
   * @returns {boolean} True when shares are issued, false otherwise.
   */
  issueShares(count) {
    if (!Number.isInteger(count) || count <= 0) {
      return false;
    }
    this.sharesIssued += count;
    return true;
  }

  /**
   * Get the total outstanding debt across all loans.
   * @returns {number} Total remaining loan balance.
   */
  getOutstandingDebt() {
    return this.loans.reduce((sum, loan) => sum + (loan.remainingBalance || 0), 0);
  }

  /**
   * Get the credit rating from total outstanding debt.
   * @returns {string} Credit rating label.
   */
  getCreditRating() {
    const debt = this.getOutstandingDebt();
    if (debt <= 0) {
      return 'AAA';
    }
    if (debt <= 50000) {
      return 'AA';
    }
    if (debt <= 150000) {
      return 'A';
    }
    if (debt <= 300000) {
      return 'BBB';
    }
    return 'BB';
  }

  /**
   * Get the current interest rate based on debt-driven credit rating.
   * @returns {number} Interest rate as a percentage.
   */
  getInterestRate() {
    const rating = this.getCreditRating();
    const interestRateByRating = {
      AAA: 4.0,
      AA: 5.0,
      A: 6.0,
      BBB: 8.0,
      BB: 10.0
    };
    return interestRateByRating[rating] || 10.0;
  }

  /**
   * Take out a loan for this corporation.
   * @param {number} amount - Principal amount to borrow.
   * Interest rate is fixed at loan origination using the corporation's
   * current credit profile at the time the loan is created.
   * @returns {Object|null} Created loan object, or null when invalid.
   */
  takeLoan(amount) {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return null;
    }

    const interestRate = this.getInterestRate();
    const loan = {
      id: this.nextLoanId,
      principal: amount,
      remainingBalance: amount,
      interestRate,
      repaymentRate: 0
    };
    this.nextLoanId += 1;
    this.loans.push(loan);
    this.addCashReserve(amount);
    return loan;
  }

  /**
   * Make a one-time payment on an outstanding loan.
   * @param {number} loanId - Loan identifier.
   * @param {number} amount - Amount to apply to the loan.
   * @returns {boolean} True when payment succeeds, false otherwise.
   */
  makeLoanPayment(loanId, amount) {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return false;
    }

    const loan = this.loans.find(entry => entry.id === loanId);
    if (!loan) {
      return false;
    }

    if (!this.spendCashReserve(amount)) {
      return false;
    }

    loan.remainingBalance = Math.max(0, loan.remainingBalance - amount);

    if (loan.remainingBalance === 0) {
      this.loans = this.loans.filter(entry => entry.id !== loanId);
    }

    return true;
  }

  /**
   * Set the recurring repayment rate for an outstanding loan.
   * @param {number} loanId - Loan identifier.
   * @param {number} repaymentRate - Repayment rate percentage.
   * @returns {boolean} True when updated, false otherwise.
   */
  setLoanRepaymentRate(loanId, repaymentRate) {
    if (typeof repaymentRate !== 'number' || !Number.isFinite(repaymentRate) || repaymentRate < 0) {
      return false;
    }

    const loan = this.loans.find(entry => entry.id === loanId);
    if (!loan) {
      return false;
    }

    loan.repaymentRate = repaymentRate;
    return true;
  }

  /**
   * Build a renderer-friendly company management snapshot.
   * @param {Universe} universe - The universe used for valuation calculations.
   * @param {Object} [shipValues={}] - Optional ship valuation map.
   * @param {Object} [goodPrices={}] - Optional goods pricing map.
   * @returns {Object} Company management state.
   * @example
   * corporation.getCompanyManagementState(universe);
   */
  getCompanyManagementState(universe, shipValues = {}, goodPrices = {}) {
    let value = 0;
    let ownedStellarObjects = [];
    if (universe && Array.isArray(universe.stellarObjects)) {
      value = this.calculateTotalValue(universe, shipValues, goodPrices);
      ownedStellarObjects = this.stellarObjects
        .map(objId => universe.stellarObjects.find(obj => obj.id === objId))
        .filter(Boolean)
        .map(stellarObject => ({
          id: stellarObject.id,
          name: stellarObject.name,
          className: stellarObject.className,
          location: stellarObject.location,
          value: stellarObject.value || 0
        }));
    }

    return {
      name: this.name,
      description: this.description,
      value,
      totalCashReserves: this.getTotalCashReserves(),
      dividendRate: this.dividendRate || 0,
      sharesIssued: this.sharesIssued || 0,
      creditRating: this.getCreditRating(),
      interestRate: this.getInterestRate(),
      outstandingDebt: this.getOutstandingDebt(),
      ownedStellarObjects,
      ships: Array.isArray(this.ships) ? [...this.ships] : [],
      loans: Array.isArray(this.loans) ? this.loans.map(loan => ({ ...loan })) : []
    };
  }

  /**
   * Calculates the total value of all corporation assets
   * @param {Universe} universe - The universe object to get stellar object values
   * @param {Object} shipValues - Object mapping ship types/IDs to values
   * @param {Object} goodPrices - Object mapping good names to current prices
   * @returns {number} Total value of all assets
   */
  calculateTotalValue(universe, shipValues = {}, goodPrices = {}) {
    let totalValue = 0;

    // Add value of stellar objects
    this.stellarObjects.forEach(objId => {
      const stellarObject = universe.stellarObjects.find(obj => obj.id === objId);
      if (stellarObject && stellarObject.value) {
        totalValue += stellarObject.value;
      }
    });

    // Add value of ships
    this.ships.forEach(shipId => {
      // Ship values can be looked up by ID or type
      const shipValue = shipValues[shipId] || 0;
      totalValue += shipValue;
    });

    // Add value of goods in inventory
    Object.entries(this.goods).forEach(([goodName, quantity]) => {
      const price = goodPrices[goodName] || 0;
      totalValue += price * quantity;
    });

    totalValue += this.getTotalCashReserves();

    return totalValue;
  }

  /**
   * Gets a summary of all corporation assets
   * @returns {Object} Summary object with asset counts and lists
   */
  getAssetSummary() {
    return {
      name: this.name,
      description: this.description,
      isPlayerOwned: this.isPlayerOwned,
      stellarObjectCount: this.stellarObjects.length,
      stellarObjects: [...this.stellarObjects],
      shipCount: this.ships.length,
      ships: [...this.ships],
      goods: { ...this.goods },
      goodTypes: Object.keys(this.goods).length,
      cashReserves: this.cashReserves,
      totalCashReserves: this.getTotalCashReserves(),
      dividendRate: this.dividendRate,
      sharesIssued: this.sharesIssued,
      loans: this.loans.map(loan => ({ ...loan })),
      creditRating: this.getCreditRating(),
      interestRate: this.getInterestRate()
    };
  }
}

module.exports = {
  Corporation
};
