const { EconomyState } = require('./economyState');
const {
  recordOpeningBalance,
  recordOpeningStock,
  recordGoodsTrade,
  recordLoanDraw,
  recordLoanPayment,
  recordConstructionSpend
} = require('./transactions');
const { ENTRY_KINDS } = require('./ledger');
const {
  ACCOUNTS,
  BANK_HOLDER,
  corporationHolder,
  playerHolder,
  marketHolder
} = require('./accounts');

const PLAYER = playerHolder('TestPlayer');
const ACME = corporationHolder('Acme Orbital');
const MARKET = marketHolder(7);

/**
 * Build an economy with a seeded starting position.
 * @returns {Object} A fresh EconomyState.
 */
function freshEconomy() {
  return new EconomyState({ seed: 'transactions-test' });
}

/**
 * Total cash across every holder, the conserved quantity.
 * @param {Object} economy - EconomyState to measure.
 * @returns {number} Total cash.
 */
function totalCash(economy) {
  return economy.getLedger().totalAcrossHolders(ACCOUNTS.CASH);
}

describe('recordOpeningBalance', () => {
  test('should credit contributed capital against the asset', () => {
    const economy = freshEconomy();
    recordOpeningBalance(economy, { tick: 0, holder: PLAYER, amount: 1000 });

    const ledger = economy.getLedger();
    expect(ledger.balance(PLAYER, ACCOUNTS.CASH)).toBe(1000);
    expect(ledger.balance(PLAYER, ACCOUNTS.CONTRIBUTED_CAPITAL)).toBe(1000);
    expect(ledger.audit().balanced).toBe(true);
  });

  test('should round a fractional amount', () => {
    const economy = freshEconomy();
    recordOpeningBalance(economy, { tick: 0, holder: PLAYER, amount: 999.6 });
    expect(economy.getLedger().balance(PLAYER, ACCOUNTS.CASH)).toBe(1000);
  });

  test('should ignore non-positive or invalid amounts', () => {
    const economy = freshEconomy();
    expect(recordOpeningBalance(economy, { tick: 0, holder: PLAYER, amount: 0 })).toBeNull();
    expect(recordOpeningBalance(economy, { tick: 0, holder: PLAYER, amount: -5 })).toBeNull();
    expect(recordOpeningBalance(economy, { tick: 0, holder: PLAYER, amount: NaN })).toBeNull();
    expect(economy.getLedger().entries).toHaveLength(0);
  });

  test('should allow a non-cash opening account', () => {
    const economy = freshEconomy();
    recordOpeningBalance(economy, {
      tick: 0, holder: ACME, amount: 25000, account: ACCOUNTS.PROPERTY
    });
    expect(economy.getLedger().balance(ACME, ACCOUNTS.PROPERTY)).toBe(25000);
  });
});

describe('recordOpeningStock', () => {
  test('should establish both the ledger balance and the cost basis', () => {
    const economy = freshEconomy();
    recordOpeningStock(economy, {
      tick: 0, holder: MARKET, goodName: 'metal', quantity: 250, totalCost: 3000
    });

    expect(economy.getLedger().balance(MARKET, ACCOUNTS.INVENTORY)).toBe(3000);
    expect(economy.getCostBasis().quantity(MARKET, 'metal')).toBe(250);
    expect(economy.getCostBasis().averageCost(MARKET, 'metal')).toBe(12);
  });

  test('should record a basis even when the assumed cost is zero', () => {
    const economy = freshEconomy();
    expect(recordOpeningStock(economy, {
      tick: 0, holder: MARKET, goodName: 'metal', quantity: 10, totalCost: 0
    })).toBeNull();

    expect(economy.getCostBasis().quantity(MARKET, 'metal')).toBe(10);
    expect(economy.getLedger().entries).toHaveLength(0);
  });

  test('should ignore non-positive quantities', () => {
    const economy = freshEconomy();
    expect(recordOpeningStock(economy, {
      tick: 0, holder: MARKET, goodName: 'metal', quantity: 0, totalCost: 100
    })).toBeNull();
    expect(economy.getCostBasis().quantity(MARKET, 'metal')).toBe(0);
  });
});

describe('recordGoodsTrade', () => {
  /**
   * Set up a market holding stock it acquired at a known cost.
   * @returns {Object} The economy.
   */
  function economyWithStockedMarket() {
    const economy = freshEconomy();
    recordOpeningBalance(economy, { tick: 0, holder: PLAYER, amount: 10000 });
    recordOpeningBalance(economy, { tick: 0, holder: MARKET, amount: 100000 });
    recordOpeningStock(economy, {
      tick: 0, holder: MARKET, goodName: 'metal', quantity: 500, totalCost: 5000
    });
    return economy;
  }

  test('should move cash from buyer to seller', () => {
    const economy = economyWithStockedMarket();
    const cashBefore = totalCash(economy);

    recordGoodsTrade(economy, {
      tick: 5, buyer: PLAYER, seller: MARKET,
      goodName: 'metal', quantity: 100, totalPrice: 1800
    });

    const ledger = economy.getLedger();
    expect(ledger.balance(PLAYER, ACCOUNTS.CASH)).toBe(10000 - 1800);
    expect(ledger.balance(MARKET, ACCOUNTS.CASH)).toBe(100000 + 1800);
    expect(totalCash(economy)).toBe(cashBefore);
  });

  test('should book the seller a real gross margin', () => {
    const economy = economyWithStockedMarket();

    recordGoodsTrade(economy, {
      tick: 5, buyer: PLAYER, seller: MARKET,
      goodName: 'metal', quantity: 100, totalPrice: 1800
    });

    const ledger = economy.getLedger();
    // Sold 100 units that cost 10 each for 18 each
    expect(ledger.balance(MARKET, ACCOUNTS.REVENUE)).toBe(1800);
    expect(ledger.balance(MARKET, ACCOUNTS.COGS)).toBe(1000);
  });

  test('should give the buyer a cost basis at what they paid', () => {
    const economy = economyWithStockedMarket();

    recordGoodsTrade(economy, {
      tick: 5, buyer: PLAYER, seller: MARKET,
      goodName: 'metal', quantity: 100, totalPrice: 1800
    });

    expect(economy.getCostBasis().quantity(PLAYER, 'metal')).toBe(100);
    expect(economy.getCostBasis().averageCost(PLAYER, 'metal')).toBe(18);
    expect(economy.getLedger().balance(PLAYER, ACCOUNTS.INVENTORY)).toBe(1800);
  });

  test('should turn a buy low sell high round trip into player profit', () => {
    const economy = economyWithStockedMarket();
    const otherMarket = marketHolder(9);
    recordOpeningBalance(economy, { tick: 0, holder: otherMarket, amount: 100000 });

    // Buy 100 metal at 12
    recordGoodsTrade(economy, {
      tick: 5, buyer: PLAYER, seller: MARKET,
      goodName: 'metal', quantity: 100, totalPrice: 1200
    });
    // Sell the same 100 elsewhere at 20
    recordGoodsTrade(economy, {
      tick: 40, buyer: otherMarket, seller: PLAYER,
      goodName: 'metal', quantity: 100, totalPrice: 2000
    });

    const ledger = economy.getLedger();
    expect(ledger.balance(PLAYER, ACCOUNTS.REVENUE)).toBe(2000);
    expect(ledger.balance(PLAYER, ACCOUNTS.COGS)).toBe(1200);
    // Inventory fully released, no residue
    expect(ledger.balance(PLAYER, ACCOUNTS.INVENTORY)).toBe(0);
    expect(economy.getCostBasis().quantity(PLAYER, 'metal')).toBe(0);
    // Net cash gain of 800
    expect(ledger.balance(PLAYER, ACCOUNTS.CASH)).toBe(10000 + 800);
  });

  test('should keep the journal balanced', () => {
    const economy = economyWithStockedMarket();
    recordGoodsTrade(economy, {
      tick: 5, buyer: PLAYER, seller: MARKET,
      goodName: 'metal', quantity: 100, totalPrice: 1800
    });
    expect(economy.getLedger().audit()).toMatchObject({
      balanced: true,
      balancesMatch: true
    });
  });

  test('should handle a seller with no recorded basis', () => {
    const economy = freshEconomy();
    recordOpeningBalance(economy, { tick: 0, holder: PLAYER, amount: 5000 });

    recordGoodsTrade(economy, {
      tick: 5, buyer: PLAYER, seller: MARKET,
      goodName: 'metal', quantity: 10, totalPrice: 200
    });

    const ledger = economy.getLedger();
    expect(ledger.balance(MARKET, ACCOUNTS.REVENUE)).toBe(200);
    // No basis means no cost of sale entry rather than a bad one
    expect(ledger.balance(MARKET, ACCOUNTS.COGS)).toBe(0);
    expect(ledger.audit().balanced).toBe(true);
  });

  test('should record a zero-price transfer as goods movement only', () => {
    const economy = freshEconomy();
    recordOpeningStock(economy, {
      tick: 0, holder: MARKET, goodName: 'metal', quantity: 50, totalCost: 500
    });

    recordGoodsTrade(economy, {
      tick: 5, buyer: PLAYER, seller: MARKET,
      goodName: 'metal', quantity: 50, totalPrice: 0
    });

    expect(economy.getCostBasis().quantity(PLAYER, 'metal')).toBe(50);
    expect(economy.getLedger().balance(MARKET, ACCOUNTS.COGS)).toBe(500);
    expect(economy.getLedger().balance(MARKET, ACCOUNTS.REVENUE)).toBe(0);
  });

  test('should ignore non-positive quantities', () => {
    const economy = economyWithStockedMarket();
    expect(recordGoodsTrade(economy, {
      tick: 5, buyer: PLAYER, seller: MARKET,
      goodName: 'metal', quantity: 0, totalPrice: 100
    })).toEqual([]);
  });

  test('should attach references to every leg', () => {
    const economy = economyWithStockedMarket();
    const posted = recordGoodsTrade(economy, {
      tick: 5, buyer: PLAYER, seller: MARKET,
      goodName: 'metal', quantity: 100, totalPrice: 1800,
      refs: { stellarObjectId: 7 }
    });

    posted.forEach(entry => {
      expect(entry.refs.goodName).toBe('metal');
      expect(entry.refs.quantity).toBe(100);
      expect(entry.refs.stellarObjectId).toBe(7);
    });
  });
});

describe('recordLoanDraw and recordLoanPayment', () => {
  test('should conserve cash on a draw', () => {
    const economy = freshEconomy();
    recordOpeningBalance(economy, { tick: 0, holder: BANK_HOLDER, amount: 1000000 });
    const cashBefore = totalCash(economy);

    recordLoanDraw(economy, { tick: 10, borrower: ACME, amount: 50000, refs: { loanId: 1 } });

    const ledger = economy.getLedger();
    expect(ledger.balance(ACME, ACCOUNTS.CASH)).toBe(50000);
    expect(ledger.balance(ACME, ACCOUNTS.DEBT)).toBe(50000);
    expect(ledger.balance(BANK_HOLDER, ACCOUNTS.LOAN_RECEIVABLE)).toBe(50000);
    expect(ledger.balance(BANK_HOLDER, ACCOUNTS.CASH)).toBe(1000000 - 50000);
    expect(totalCash(economy)).toBe(cashBefore);
  });

  test('should unwind cleanly on full repayment', () => {
    const economy = freshEconomy();
    recordOpeningBalance(economy, { tick: 0, holder: BANK_HOLDER, amount: 1000000 });
    recordLoanDraw(economy, { tick: 10, borrower: ACME, amount: 50000 });
    recordLoanPayment(economy, { tick: 90, borrower: ACME, amount: 50000 });

    const ledger = economy.getLedger();
    expect(ledger.balance(ACME, ACCOUNTS.DEBT)).toBe(0);
    expect(ledger.balance(ACME, ACCOUNTS.CASH)).toBe(0);
    expect(ledger.balance(BANK_HOLDER, ACCOUNTS.LOAN_RECEIVABLE)).toBe(0);
    expect(ledger.balance(BANK_HOLDER, ACCOUNTS.CASH)).toBe(1000000);
    expect(ledger.audit().balanced).toBe(true);
  });

  test('should ignore non-positive amounts', () => {
    const economy = freshEconomy();
    expect(recordLoanDraw(economy, { tick: 1, borrower: ACME, amount: 0 })).toEqual([]);
    expect(recordLoanPayment(economy, { tick: 1, borrower: ACME, amount: -100 })).toEqual([]);
    expect(economy.getLedger().entries).toHaveLength(0);
  });

  test('should tag entries with the loan kind', () => {
    const economy = freshEconomy();
    const posted = recordLoanDraw(economy, { tick: 10, borrower: ACME, amount: 5000 });
    posted.forEach(entry => expect(entry.kind).toBe(ENTRY_KINDS.LOAN_DRAW));
  });
});

describe('recordConstructionSpend', () => {
  test('should capitalize the spend to property rather than expense it', () => {
    const economy = freshEconomy();
    recordOpeningBalance(economy, { tick: 0, holder: ACME, amount: 10000 });

    recordConstructionSpend(economy, {
      tick: 15, spender: ACME, recipient: MARKET, amount: 500,
      refs: { stellarObjectId: 3, buildingType: 'Mine' }
    });

    const ledger = economy.getLedger();
    expect(ledger.balance(ACME, ACCOUNTS.PROPERTY)).toBe(500);
    expect(ledger.balance(ACME, ACCOUNTS.CASH)).toBe(9500);
    // Construction must not reduce income for the period
    expect(ledger.balance(ACME, ACCOUNTS.OPERATING_EXPENSE)).toBe(0);
  });

  test('should pay the credits to the recipient rather than destroying them', () => {
    const economy = freshEconomy();
    recordOpeningBalance(economy, { tick: 0, holder: ACME, amount: 10000 });
    const cashBefore = totalCash(economy);

    recordConstructionSpend(economy, {
      tick: 15, spender: ACME, recipient: MARKET, amount: 500
    });

    expect(economy.getLedger().balance(MARKET, ACCOUNTS.CASH)).toBe(500);
    expect(economy.getLedger().balance(MARKET, ACCOUNTS.REVENUE)).toBe(500);
    expect(totalCash(economy)).toBe(cashBefore);
  });

  test('should still capitalize when no recipient is supplied', () => {
    const economy = freshEconomy();
    recordOpeningBalance(economy, { tick: 0, holder: ACME, amount: 10000 });

    const posted = recordConstructionSpend(economy, {
      tick: 15, spender: ACME, amount: 500
    });

    expect(posted).toHaveLength(1);
    expect(economy.getLedger().balance(ACME, ACCOUNTS.PROPERTY)).toBe(500);
  });

  test('should ignore non-positive amounts', () => {
    const economy = freshEconomy();
    expect(recordConstructionSpend(economy, {
      tick: 1, spender: ACME, recipient: MARKET, amount: 0
    })).toEqual([]);
  });
});

describe('money conservation across mixed activity', () => {
  test('should keep total cash invariant through a long mixed sequence', () => {
    const economy = freshEconomy();

    // The only defined sources of value
    recordOpeningBalance(economy, { tick: 0, holder: PLAYER, amount: 5000 });
    recordOpeningBalance(economy, { tick: 0, holder: ACME, amount: 20000 });
    recordOpeningBalance(economy, { tick: 0, holder: BANK_HOLDER, amount: 1000000 });
    recordOpeningBalance(economy, { tick: 0, holder: MARKET, amount: 250000 });
    recordOpeningStock(economy, {
      tick: 0, holder: MARKET, goodName: 'metal', quantity: 5000, totalCost: 50000
    });

    const expectedCash = 5000 + 20000 + 1000000 + 250000;
    expect(totalCash(economy)).toBe(expectedCash);

    recordLoanDraw(economy, { tick: 5, borrower: ACME, amount: 75000 });

    for (let i = 1; i <= 30; i += 1) {
      recordGoodsTrade(economy, {
        tick: 10 + i, buyer: PLAYER, seller: MARKET,
        goodName: 'metal', quantity: 7, totalPrice: 7 * (10 + (i % 5))
      });
      recordGoodsTrade(economy, {
        tick: 50 + i, buyer: MARKET, seller: PLAYER,
        goodName: 'metal', quantity: 3, totalPrice: 3 * (14 + (i % 3))
      });
      recordConstructionSpend(economy, {
        tick: 60 + i, spender: ACME, recipient: MARKET, amount: 250
      });
    }

    recordLoanPayment(economy, { tick: 200, borrower: ACME, amount: 30000 });

    // Not one credit created or destroyed by any of it
    expect(totalCash(economy)).toBe(expectedCash);
    expect(economy.getLedger().audit()).toMatchObject({
      balanced: true,
      balancesMatch: true
    });
  });

  test('should keep the cost basis in step with inventory balances', () => {
    const economy = freshEconomy();
    recordOpeningBalance(economy, { tick: 0, holder: PLAYER, amount: 50000 });
    recordOpeningBalance(economy, { tick: 0, holder: MARKET, amount: 50000 });
    recordOpeningStock(economy, {
      tick: 0, holder: MARKET, goodName: 'metal', quantity: 1000, totalCost: 12000
    });

    for (let i = 1; i <= 25; i += 1) {
      recordGoodsTrade(economy, {
        tick: i, buyer: PLAYER, seller: MARKET,
        goodName: 'metal', quantity: 11, totalPrice: 11 * 15
      });
    }

    const ledger = economy.getLedger();
    const basis = economy.getCostBasis();

    expect(basis.holderInventoryValue(PLAYER))
      .toBe(ledger.balance(PLAYER, ACCOUNTS.INVENTORY));
    expect(basis.holderInventoryValue(MARKET))
      .toBe(ledger.balance(MARKET, ACCOUNTS.INVENTORY));
  });
});
