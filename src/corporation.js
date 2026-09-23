const { settingsBlock } = require('./settings');
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
    /** Tick the current cash deficit began, or null when solvent. */
    this.deficitSinceTick = null;
    /** Whether this corporation has been declared bankrupt. */
    this.isBankrupt = false;
    /** Tick bankruptcy was declared, or null. */
    this.bankruptSinceTick = null;
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
   * Set the corporation's cash position from the ledger.
   *
   * The ledger is the single source of truth for cash: production pays wages,
   * restocking buys stock, and interest accrues, all of which post there.
   * `cashReserves` is a cached projection of that so the UI and the
   * discretionary-spend guards have a number to read without querying the
   * journal.
   *
   * Unlike `addCashReserve` and `spendCashReserve`, this accepts a negative
   * value. A corporation genuinely can be overdrawn -- unavoidable costs do not
   * stop for lack of funds -- and hiding that behind a floor at zero is what
   * let corporations run unlimited deficits unnoticed. Solvency enforcement
   * reads this to decide when to force a loan.
   * @param {number} amount - Cash position, which may be negative.
   * @returns {number} The position that was set.
   * @example
   * corporation.setCashPosition(ledger.balance(holder, ACCOUNTS.CASH));
   */
  setCashPosition(amount) {
    if (typeof amount === 'number' && Number.isFinite(amount)) {
      this.cashReserves = amount;
      return this.cashReserves;
    }

    // Older saves store reserves as an object of named sub-balances. Fall back
    // to the normalizer for those, which sums them and floors at zero.
    this.cashReserves = Corporation.normalizeCashReserves(amount);
    return this.cashReserves;
  }

  /**
   * Get the total outstanding debt across all loans.
   * @returns {number} Total remaining loan balance.
   */
  getOutstandingDebt() {
    return this.loans.reduce((sum, loan) => sum + (loan.remainingBalance || 0), 0);
  }

  /**
   * The rating ladder, best grade first.
   *
   * Read from the `credit` block in game settings, which is the one place the
   * grades, their leverage bands and their interest rates are written down.
   * Keeping all three in one table is what stops a grade existing with no rate
   * behind it, or a rate surviving a grade being renamed.
   * @param {Object} [settings] - Resolved game settings.
   * @returns {Array<Object>} `{ grade, max_leverage, annual_rate }`, best first.
   * @example
   * Corporation.ratingLadder()[0].grade; // => 'A+'
   */
  static ratingLadder(settings = {}) {
    return settingsBlock(settings, 'credit').ratings || [];
  }

  /**
   * Grades from best to worst, for comparing two ratings.
   * @param {Object} [settings] - Resolved game settings.
   * @returns {Array<string>} Grades, best first.
   * @example
   * Corporation.RATING_ORDER; // => ['A+', 'A', 'A-', ... 'F']
   */
  static ratingOrder(settings = {}) {
    return Corporation.ratingLadder(settings).map(entry => entry.grade);
  }

  /**
   * Grades from best to worst, using the shipped settings.
   * @type {Array<string>}
   */
  static get RATING_ORDER() {
    return Corporation.ratingOrder();
  }

  /**
   * The worst grade on the ladder, assigned to a company that has failed.
   * @param {Object} [settings] - Resolved game settings.
   * @returns {string} The terminal grade.
   * @example
   * Corporation.failingGrade(); // => 'F'
   */
  static failingGrade(settings = {}) {
    const order = Corporation.ratingOrder(settings);
    return order[order.length - 1] || 'F';
  }

  /**
   * Annual interest rate charged at a grade, as a percentage.
   * @param {string} rating - A grade from the ladder.
   * @param {Object} [settings] - Resolved game settings.
   * @returns {number} Annual percentage rate.
   * @example
   * Corporation.interestRateForRating('B'); // => 7
   */
  static interestRateForRating(rating, settings = {}) {
    const ladder = Corporation.ratingLadder(settings);
    const match = ladder.find(entry => entry.grade === rating);
    return Number(
      (match || ladder[ladder.length - 1] || {}).annual_rate
    ) || 0;
  }

  /**
   * Get the credit rating from how leveraged the corporation is.
   *
   * Grades run like school grades, A+ down to F, and come from the leverage
   * bands in settings. Leverage rather than the raw size of the debt: a small
   * loan with nothing behind it is worse credit than a large one against
   * valuable worlds.
   *
   * F is reserved for a company that has actually failed rather than one that
   * is merely stretched -- bankrupt, carrying debt against no assets, or past a
   * loan's maturity without having paid it.
   *
   * Book value is used rather than appraised value, deliberately. A lender
   * assessing collateral cares what it could recover, not what the borrower
   * hopes to earn, and book value also keeps this method free of any dependency
   * that could reach a share price.
   * @param {Object} [universe] - Universe for valuing owned worlds; without it
   *   only cash counts as cover, which is the conservative reading.
   * @param {Object} [shipValues={}] - Optional ship valuation map.
   * @param {Object} [goodPrices={}] - Optional goods pricing map.
   * @param {Object} [options={}] - `{ settings, tick }`.
   * @returns {string} A grade from the ladder.
   * @example
   * const rating = corporation.getCreditRating(universe);
   */
  getCreditRating(universe = null, shipValues = {}, goodPrices = {}, options = {}) {
    const settings = options.settings || {};
    const ladder = Corporation.ratingLadder(settings);
    const failing = Corporation.failingGrade(settings);

    if (this.isBankrupt) {
      return failing;
    }

    // Letting a balloon come due unpaid is a default, whatever the ratios say
    const tick = Number(options.tick);
    if (Number.isFinite(tick) && this.getMaturedLoans(tick).length > 0) {
      return failing;
    }

    const debt = this.getOutstandingDebt();
    if (debt <= 0) {
      return ladder[0]?.grade || failing;
    }

    const assets = universe && Array.isArray(universe.stellarObjects)
      ? this.calculateTotalAssetValue(universe, shipValues, goodPrices)
      : this.getTotalCashReserves();

    // Debt with nothing behind it is a failure, not a bad ratio
    if (assets <= 0) {
      return failing;
    }

    const leverage = debt / assets;
    const band = ladder.find(
      entry => entry.max_leverage !== null
        && entry.max_leverage !== undefined
        && entry.max_leverage > 0
        && leverage <= entry.max_leverage
    );

    return band ? band.grade : failing;
  }

  /**
   * Get the current interest rate for new borrowing.
   * @param {Object} [universe] - Universe for valuing owned worlds.
   * @param {Object} [shipValues={}] - Optional ship valuation map.
   * @param {Object} [goodPrices={}] - Optional goods pricing map.
   * @returns {number} Interest rate as a percentage.
   * @example
   * const rate = corporation.getInterestRate(universe);
   */
  getInterestRate(universe = null, shipValues = {}, goodPrices = {}, options = {}) {
    return Corporation.interestRateForRating(
      this.getCreditRating(universe, shipValues, goodPrices, options),
      options.settings || {}
    );
  }

  /**
   * Take out a loan for this corporation.
   * @param {number} amount - Principal amount to borrow.
   * Interest rate is fixed at loan origination using the corporation's
   * current credit profile at the time the loan is created.
   * @returns {Object|null} Created loan object, or null when invalid.
   */
  takeLoan(amount, options = {}) {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return null;
    }

    // Rate against whatever collateral the caller can see. Without a universe
    // only cash counts, which prices a world-owning corporation as if it had
    // nothing to pledge.
    const interestRate = this.getInterestRate(
      options.universe || null,
      options.shipValues || {},
      options.goodPrices || {},
      { settings: options.settings || {}, tick: options.originTick }
    );
    const loan = {
      id: this.nextLoanId,
      principal: amount,
      remainingBalance: amount,
      interestRate,
      repaymentRate: 0,
      // Balloon structure: nothing is due until the maturity tick, at which
      // point the whole balance falls due at once. A dated, public cliff is
      // what makes credit risk priceable rather than a vague sense of trouble.
      originTick: Number(options.originTick) || 0,
      maturityTick: Number(options.maturityTick) || 0,
      accruedInterest: 0
    };
    this.nextLoanId += 1;
    this.loans.push(loan);
    this.addCashReserve(amount);
    return loan;
  }

  /**
   * Accrue interest on every outstanding loan for a number of elapsed ticks.
   *
   * Each loan uses its own rate, fixed at origination, so a corporation that
   * borrowed while healthy keeps its cheap debt even after its credit
   * deteriorates. Interest capitalizes into the outstanding balance rather than
   * being billed, which is what a balloon loan does: the debt compounds quietly
   * until the maturity tick, when all of it falls due at once.
   *
   * The caller supplies ticks per year rather than a rate, because the rate
   * varies per loan and only the calendar is shared.
   * @param {number} ticksPerYear - Ticks in a game year, from the clock module.
   * @param {number} [elapsedTicks=1] - Ticks elapsed since the last accrual.
   * @returns {Array<Object>} Per-loan accruals as `{ loanId, interest }`.
   * @example
   * corporation.accrueLoanInterest(8640, 1);
   */
  accrueLoanInterest(ticksPerYear, elapsedTicks = 1) {
    const perYear = Number(ticksPerYear);
    const ticks = Number(elapsedTicks);
    if (!Number.isFinite(perYear) || perYear <= 0 || !Number.isFinite(ticks) || ticks <= 0) {
      return [];
    }

    const accruals = [];

    this.loans.forEach(loan => {
      const annualRate = Number(loan.interestRate) || 0;
      if (annualRate <= 0 || loan.remainingBalance <= 0) {
        return;
      }

      const interest = loan.remainingBalance * ((annualRate / 100) / perYear) * ticks;
      if (interest <= 0) {
        return;
      }

      loan.remainingBalance += interest;
      loan.accruedInterest = (loan.accruedInterest || 0) + interest;
      accruals.push({ loanId: loan.id, interest });
    });

    return accruals;
  }

  /**
   * Get loans whose maturity tick has arrived or passed.
   * @param {number} tick - Current game tick.
   * @returns {Array<Object>} Matured loans.
   * @example
   * const due = corporation.getMaturedLoans(game.getTicks());
   */
  getMaturedLoans(tick) {
    return this.loans.filter(
      loan => loan.maturityTick > 0 && tick >= loan.maturityTick && loan.remainingBalance > 0
    );
  }

  /**
   * Make a one-time payment on an outstanding loan.
   *
   * The payment is capped at what is still owed. Paying more than the balance
   * previously spent the full amount while flooring the balance at zero, which
   * silently destroyed the excess credits.
   * @param {number} loanId - Loan identifier.
   * @param {number} amount - Amount to apply; the excess over the balance is not spent.
   * @returns {boolean} True when payment succeeds, false otherwise.
   * @example
   * corporation.makeLoanPayment(1, 5000);
   */
  makeLoanPayment(loanId, amount) {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return false;
    }

    const loan = this.loans.find(entry => entry.id === loanId);
    if (!loan) {
      return false;
    }

    const applied = Math.min(amount, loan.remainingBalance);
    if (applied <= 0) {
      return false;
    }

    if (!this.spendCashReserve(applied)) {
      return false;
    }

    loan.remainingBalance -= applied;

    // Compare against a tolerance rather than exactly zero: once interest
    // accrues, balances are no longer guaranteed to land on a whole credit and
    // an exact check would leave paid-off loans behind as zombies.
    if (loan.remainingBalance < 0.005) {
      this.loans = this.loans.filter(entry => entry.id !== loanId);
    }

    return true;
  }

  /**
   * Get the amount a payment would actually apply to a loan.
   * @param {number} loanId - Loan identifier.
   * @param {number} amount - Proposed payment amount.
   * @returns {number} Amount that would be applied, zero when none.
   * @example
   * const applied = corporation.loanPaymentApplied(1, 30000);
   */
  loanPaymentApplied(loanId, amount) {
    const loan = this.loans.find(entry => entry.id === loanId);
    if (!loan || typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return 0;
    }
    return Math.min(amount, loan.remainingBalance);
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
    let assetValue = 0;
    let ownedStellarObjects = [];
    if (universe && Array.isArray(universe.stellarObjects)) {
      assetValue = this.calculateTotalAssetValue(universe, shipValues, goodPrices);
      value = assetValue - this.getOutstandingDebt();
      const stellarObjectById = new Map(universe.stellarObjects.map(stellarObject => [stellarObject.id, stellarObject]));
      const systemById = new Map(
        Array.isArray(universe.systems)
          ? universe.systems.map(system => [system.id, system])
          : []
      );
      ownedStellarObjects = this.stellarObjects
        .map(objId => stellarObjectById.get(objId))
        .filter(Boolean)
        .map((stellarObject) => {
          const locationSystem = systemById.get(stellarObject.location);
          const locationName = locationSystem && locationSystem.name ? locationSystem.name : stellarObject.location;
          return {
            id: stellarObject.id,
            name: stellarObject.name,
            className: stellarObject.className,
            location: stellarObject.location,
            locationName,
            value: stellarObject.value || 0
          };
        });
    }

    return {
      name: this.name,
      description: this.description,
      // Net of debt. assetValue is the gross figure, so a reader can see both
      // what the company holds and what it is actually worth.
      //
      // Rounded at this boundary only. Interest accrues fractionally on loan
      // balances, so these are genuinely non-integer and would otherwise reach
      // the interface as figures like -183906.89224400593. The underlying
      // methods stay precise.
      value: Math.round(value),
      assetValue: Math.round(assetValue),
      totalCashReserves: Math.round(this.getTotalCashReserves()),
      dividendRate: this.dividendRate || 0,
      sharesIssued: this.sharesIssued || 0,
      creditRating: this.getCreditRating(universe, shipValues, goodPrices),
      interestRate: this.getInterestRate(universe, shipValues, goodPrices),
      isBankrupt: this.isBankrupt,
      deficitSinceTick: this.deficitSinceTick,
      outstandingDebt: Math.round(this.getOutstandingDebt()),
      ownedStellarObjects,
      ships: Array.isArray(this.ships) ? [...this.ships] : [],
      loans: Array.isArray(this.loans) ? this.loans.map(loan => ({ ...loan })) : []
    };
  }

  /**
   * Calculates the gross value of everything the corporation owns.
   *
   * Assets only: stellar objects, ships, goods inventory and cash. Debt is not
   * netted off, so this is what the corporation holds rather than what it is
   * worth. Use `calculateTotalValue()` for the latter.
   * @param {Universe} universe - The universe object to get stellar object values
   * @param {Object} [shipValues={}] - Object mapping ship types/IDs to values
   * @param {Object} [goodPrices={}] - Object mapping good names to current prices
   * @returns {number} Gross value of all assets
   * @example
   * const assets = corporation.calculateTotalAssetValue(universe, shipValues, goodPrices);
   */
  calculateTotalAssetValue(universe, shipValues = {}, goodPrices = {}) {
    let assetValue = 0;

    // Add value of stellar objects
    this.stellarObjects.forEach(objId => {
      const stellarObject = universe.stellarObjects.find(obj => obj.id === objId);
      if (stellarObject && stellarObject.value) {
        assetValue += stellarObject.value;
      }
    });

    // Add value of ships
    this.ships.forEach(shipId => {
      // Ship values can be looked up by ID or type
      const shipValue = shipValues[shipId] || 0;
      assetValue += shipValue;
    });

    // Add value of goods in inventory
    Object.entries(this.goods).forEach(([goodName, quantity]) => {
      const price = goodPrices[goodName] || 0;
      assetValue += price * quantity;
    });

    assetValue += this.getTotalCashReserves();

    return assetValue;
  }

  /**
   * Calculates what the corporation is worth: assets less what it owes.
   *
   * This previously summed assets and ignored debt entirely, which reported a
   * borrowing corporation as richer by exactly the amount it owed. A loan raises
   * cash and liabilities together and leaves the owner no better off, so netting
   * the debt is what makes the figure mean anything.
   *
   * The result can be negative. A corporation whose debts exceed its assets is
   * insolvent, and hiding that behind a floor at zero would conceal the one
   * condition that matters most.
   * @param {Universe} universe - The universe object to get stellar object values
   * @param {Object} [shipValues={}] - Object mapping ship types/IDs to values
   * @param {Object} [goodPrices={}] - Object mapping good names to current prices
   * @returns {number} Net value of the corporation, which may be negative
   * @example
   * const netWorth = corporation.calculateTotalValue(universe, shipValues, goodPrices);
   */
  calculateTotalValue(universe, shipValues = {}, goodPrices = {}) {
    return this.calculateTotalAssetValue(universe, shipValues, goodPrices)
      - this.getOutstandingDebt();
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
