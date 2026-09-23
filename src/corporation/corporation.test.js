const { Corporation } = require('./corporation');
const { Universe, System, StellarObject } = require('../universe');

// Grades from strongest to weakest, read from the settings ladder so these
// tests assert one rating is worse than another without restating the bands.
const RATING_ORDER = Corporation.RATING_ORDER;
const BEST = RATING_ORDER[0];
const WORST = RATING_ORDER[RATING_ORDER.length - 1];

describe('Corporation', () => {
  let corporation;

  beforeEach(() => {
    corporation = new Corporation('Test Corp', 'A test corporation', true);
  });

  describe('constructor', () => {
    test('should create a corporation with name and description', () => {
      expect(corporation.name).toBe('Test Corp');
      expect(corporation.description).toBe('A test corporation');
      expect(corporation.isPlayerOwned).toBe(true);
    });

    test('should initialize empty asset arrays', () => {
      expect(corporation.stellarObjects).toEqual([]);
      expect(corporation.ships).toEqual([]);
      expect(corporation.goods).toEqual({});
      expect(corporation.cashReserves).toBe(0);
      expect(corporation.dividendRate).toBe(0);
      expect(corporation.sharesIssued).toBe(0);
      expect(corporation.loans).toEqual([]);
    });

    test('should default isPlayerOwned to false', () => {
      const npcCorp = new Corporation('NPC Corp', 'An NPC corporation');
      expect(npcCorp.isPlayerOwned).toBe(false);
    });
  });

  describe('stellar object management', () => {
    test('should add stellar objects', () => {
      corporation.addStellarObject(1);
      corporation.addStellarObject(2);
      expect(corporation.stellarObjects).toEqual([1, 2]);
    });

    test('should not add duplicate stellar objects', () => {
      corporation.addStellarObject(1);
      corporation.addStellarObject(1);
      expect(corporation.stellarObjects).toEqual([1]);
    });

    test('should remove stellar objects', () => {
      corporation.addStellarObject(1);
      corporation.addStellarObject(2);
      corporation.removeStellarObject(1);
      expect(corporation.stellarObjects).toEqual([2]);
    });

    test('should handle removing non-existent stellar objects', () => {
      corporation.addStellarObject(1);
      corporation.removeStellarObject(999);
      expect(corporation.stellarObjects).toEqual([1]);
    });
  });

  describe('ship management', () => {
    test('should add ships', () => {
      corporation.addShip(10);
      corporation.addShip(20);
      expect(corporation.ships).toEqual([10, 20]);
    });

    test('should not add duplicate ships', () => {
      corporation.addShip(10);
      corporation.addShip(10);
      expect(corporation.ships).toEqual([10]);
    });

    test('should remove ships', () => {
      corporation.addShip(10);
      corporation.addShip(20);
      corporation.removeShip(10);
      expect(corporation.ships).toEqual([20]);
    });

    test('should handle removing non-existent ships', () => {
      corporation.addShip(10);
      corporation.removeShip(999);
      expect(corporation.ships).toEqual([10]);
    });
  });

  describe('goods management', () => {
    test('should add goods', () => {
      corporation.addGoods('Food', 100);
      expect(corporation.goods.Food).toBe(100);
    });

    test('should accumulate goods of same type', () => {
      corporation.addGoods('Food', 100);
      corporation.addGoods('Food', 50);
      expect(corporation.goods.Food).toBe(150);
    });

    test('should remove goods successfully', () => {
      corporation.addGoods('Food', 100);
      const result = corporation.removeGoods('Food', 30);
      expect(result).toBe(true);
      expect(corporation.goods.Food).toBe(70);
    });

    test('should remove goods entry when quantity reaches zero', () => {
      corporation.addGoods('Food', 100);
      corporation.removeGoods('Food', 100);
      expect(corporation.goods.Food).toBeUndefined();
    });

    test('should fail to remove more goods than available', () => {
      corporation.addGoods('Food', 50);
      const result = corporation.removeGoods('Food', 100);
      expect(result).toBe(false);
      expect(corporation.goods.Food).toBe(50);
    });

    test('should fail to remove non-existent goods', () => {
      const result = corporation.removeGoods('Food', 10);
      expect(result).toBe(false);
    });
  });

  describe('cash reserve management', () => {
    test('should add and spend fungible cash reserves', () => {
      expect(corporation.addCashReserve(1000)).toBe(true);
      expect(corporation.cashReserves).toBe(1000);

      expect(corporation.spendCashReserve(250)).toBe(true);
      expect(corporation.cashReserves).toBe(750);
    });

    describe('company management operations', () => {
      test('sets dividend rate and issues shares', () => {
        expect(corporation.setDividendRate(12.5)).toBe(true);
        expect(corporation.dividendRate).toBe(12.5);
        expect(corporation.issueShares(1000)).toBe(true);
        expect(corporation.sharesIssued).toBe(1000);
      });

      test('rejects invalid dividend and share values', () => {
        expect(corporation.setDividendRate(-1)).toBe(false);
        expect(corporation.setDividendRate(150)).toBe(false);
        expect(corporation.issueShares(0)).toBe(false);
        expect(corporation.issueShares(1.5)).toBe(false);
      });

      test('supports taking loans, payment, and repayment rate', () => {
        corporation.addCashReserve(1000);
        const loan = corporation.takeLoan(5000);

        expect(loan).toBeTruthy();
        expect(corporation.loans).toHaveLength(1);
        expect(corporation.getOutstandingDebt()).toBe(5000);
        expect(corporation.setLoanRepaymentRate(loan.id, 1.25)).toBe(true);
        expect(corporation.loans[0].repaymentRate).toBe(1.25);
        expect(corporation.makeLoanPayment(loan.id, 750)).toBe(true);
        expect(corporation.loans[0].remainingBalance).toBe(4250);
      });
    });

    test('should fail to spend more than available cash reserves', () => {
      corporation.addCashReserve(100);
      expect(corporation.spendCashReserve(200)).toBe(false);
      expect(corporation.cashReserves).toBe(100);
    });

    test('should reject zero-value add and spend operations', () => {
      expect(corporation.addCashReserve(0)).toBe(false);
      expect(corporation.spendCashReserve(0)).toBe(false);
      expect(corporation.cashReserves).toBe(0);
    });

    test('should calculate total fungible cash reserves', () => {
      corporation.addCashReserve(400);
      corporation.addCashReserve(600);
      corporation.addCashReserve(250);
      expect(corporation.getTotalCashReserves()).toBe(1250);
    });

    test('should normalize legacy object-based reserves to a numeric total', () => {
      const legacyCorp = new Corporation('Legacy Corp', 'Legacy reserves', false, {
        trade: 400,
        buildings: 600,
        stocks: 250
      });
      expect(legacyCorp.cashReserves).toBe(1250);
    });
  });

  describe('calculateTotalValue', () => {
    let universe;
    let stellarObject1;
    let stellarObject2;

    beforeEach(() => {
      universe = new Universe();
      stellarObject1 = { id: 1, value: 10000 };
      stellarObject2 = { id: 2, value: 15000 };
      universe.stellarObjects = [stellarObject1, stellarObject2];
    });

    test('should calculate value from stellar objects', () => {
      corporation.addStellarObject(1);
      corporation.addStellarObject(2);
      const value = corporation.calculateTotalValue(universe);
      expect(value).toBe(25000);
    });

    test('should calculate value from ships', () => {
      corporation.addShip(10);
      corporation.addShip(20);
      const shipValues = { 10: 5000, 20: 7000 };
      const value = corporation.calculateTotalValue(universe, shipValues);
      expect(value).toBe(12000);
    });

    test('should calculate value from goods', () => {
      corporation.addGoods('Food', 100);
      corporation.addGoods('Ore', 50);
      const goodPrices = { Food: 10, Ore: 20 };
      const value = corporation.calculateTotalValue(universe, {}, goodPrices);
      expect(value).toBe(2000); // (100 * 10) + (50 * 20)
    });

    test('should calculate combined value from all assets', () => {
      corporation.addStellarObject(1);
      corporation.addShip(10);
      corporation.addGoods('Food', 100);
      corporation.addCashReserve(500);

      const shipValues = { 10: 5000 };
      const goodPrices = { Food: 10 };
      const value = corporation.calculateTotalValue(universe, shipValues, goodPrices);

      expect(value).toBe(16500); // 10000 + 5000 + 1000 + 500
    });

    test('should handle missing values gracefully', () => {
      corporation.addStellarObject(999); // Non-existent object
      corporation.addShip(999); // Ship without price
      corporation.addGoods('UnpricedGood', 100);

      const value = corporation.calculateTotalValue(universe, {}, {});
      expect(value).toBe(0);
    });

    test('should subtract outstanding debt', () => {
      corporation.addStellarObject(1);
      corporation.takeLoan(4000);

      // Borrowing raises cash and debt equally, so what the company is worth
      // is unchanged. Counting only the cash reported it as richer by exactly
      // the amount it owed.
      expect(corporation.calculateTotalValue(universe)).toBe(10000);
    });

    test('should report negative value when debt exceeds assets', () => {
      corporation.takeLoan(50000);
      corporation.spendCashReserve(50000);

      expect(corporation.calculateTotalValue(universe)).toBe(-50000);
    });

    test('should rise as debt is repaid', () => {
      corporation.addStellarObject(1);
      corporation.addCashReserve(20000);
      const loan = corporation.takeLoan(8000);

      const beforeRepayment = corporation.calculateTotalValue(universe);
      corporation.makeLoanPayment(loan.id, 8000);

      // Repaying spends cash and clears debt one for one, so value is flat
      expect(corporation.calculateTotalValue(universe)).toBe(beforeRepayment);
      expect(corporation.getOutstandingDebt()).toBe(0);
    });

    test('should reflect accrued interest as it compounds', () => {
      corporation.addStellarObject(1);
      corporation.takeLoan(10000);
      const beforeInterest = corporation.calculateTotalValue(universe);

      corporation.accrueLoanInterest(8640, 8640);

      // Interest capitalizes into the balance without adding any asset, so it
      // is a straight reduction in what the company is worth
      expect(corporation.calculateTotalValue(universe)).toBeLessThan(beforeInterest);
    });
  });

  describe('calculateTotalAssetValue', () => {
    let universe;

    beforeEach(() => {
      universe = new Universe();
      universe.stellarObjects = [{ id: 1, value: 10000 }, { id: 2, value: 15000 }];
    });

    test('should total every asset class', () => {
      corporation.addStellarObject(1);
      corporation.addShip(10);
      corporation.addGoods('Food', 100);
      corporation.addCashReserve(500);

      expect(corporation.calculateTotalAssetValue(universe, { 10: 5000 }, { Food: 10 }))
        .toBe(16500);
    });

    test('should ignore debt entirely', () => {
      corporation.addStellarObject(1);
      corporation.takeLoan(4000);

      // Assets include the borrowed cash; the matching liability is not netted
      expect(corporation.calculateTotalAssetValue(universe)).toBe(14000);
    });

    test('should equal total value for a debt-free corporation', () => {
      corporation.addStellarObject(1);
      corporation.addCashReserve(2500);

      expect(corporation.calculateTotalAssetValue(universe))
        .toBe(corporation.calculateTotalValue(universe));
    });

    test('should differ from total value by exactly the outstanding debt', () => {
      corporation.addStellarObject(2);
      corporation.addCashReserve(1000);
      corporation.takeLoan(7500);

      expect(
        corporation.calculateTotalAssetValue(universe) - corporation.calculateTotalValue(universe)
      ).toBe(corporation.getOutstandingDebt());
    });

    test('should handle missing values gracefully', () => {
      corporation.addStellarObject(999);
      corporation.addShip(999);
      corporation.addGoods('UnpricedGood', 100);

      expect(corporation.calculateTotalAssetValue(universe, {}, {})).toBe(0);
    });

    test('should never go negative from debt alone', () => {
      corporation.takeLoan(50000);
      corporation.spendCashReserve(50000);

      expect(corporation.calculateTotalAssetValue(universe)).toBe(0);
    });
  });

  describe('getAssetSummary', () => {
    test('should return complete asset summary', () => {
      corporation.addStellarObject(1);
      corporation.addStellarObject(2);
      corporation.addShip(10);
      corporation.addGoods('Food', 100);
      corporation.addGoods('Ore', 50);

      const summary = corporation.getAssetSummary();

      expect(summary.name).toBe('Test Corp');
      expect(summary.description).toBe('A test corporation');
      expect(summary.isPlayerOwned).toBe(true);
      expect(summary.stellarObjectCount).toBe(2);
      expect(summary.stellarObjects).toEqual([1, 2]);
      expect(summary.shipCount).toBe(1);
      expect(summary.ships).toEqual([10]);
      expect(summary.goods).toEqual({ Food: 100, Ore: 50 });
      expect(summary.goodTypes).toBe(2);
    });

    test('should return summary for empty corporation', () => {
      const summary = corporation.getAssetSummary();

      expect(summary.stellarObjectCount).toBe(0);
      expect(summary.shipCount).toBe(0);
      expect(summary.goodTypes).toBe(0);
    });
  });

  describe('getCompanyManagementState', () => {
    test('should return management snapshot with derived financial fields', () => {
      const universe = new Universe();
      universe.systems = [{ id: 2, name: 'Alpha System' }];
      universe.stellarObjects = [
        { id: 1, name: 'Farm World', className: 'Planet', location: 2, value: 25000 }
      ];

      corporation.addStellarObject(1);
      corporation.addShip('Freighter');
      corporation.addCashReserve(5000);
      corporation.setDividendRate(4.5);
      corporation.issueShares(100);
      corporation.takeLoan(1000);

      const state = corporation.getCompanyManagementState(universe);
      expect(state.name).toBe('Test Corp');
      expect(state.description).toBe('A test corporation');
      expect(state.value).toBeGreaterThan(0);
      expect(state.totalCashReserves).toBe(6000);
      expect(state.dividendRate).toBe(4.5);
      expect(state.sharesIssued).toBe(100);
      expect(state.outstandingDebt).toBe(1000);
      expect(state.ownedStellarObjects).toEqual([
        { id: 1, name: 'Farm World', className: 'Planet', location: 2, locationName: 'Alpha System', value: 25000 }
      ]);
      expect(state.ships).toEqual(['Freighter']);
      expect(state.loans).toHaveLength(1);

      state.loans[0].remainingBalance = 0;
      expect(corporation.loans[0].remainingBalance).toBe(1000);
    });
  });

  describe('loan payment capping', () => {
    test('should not spend more than the loan still owes', () => {
      const corporation = new Corporation('Acme', 'desc', true, 100000);
      const loan = corporation.takeLoan(10000);

      expect(corporation.makeLoanPayment(loan.id, 30000)).toBe(true);

      // Overpaying previously spent the full amount while flooring the balance
      // at zero, destroying the excess credits
      expect(corporation.getTotalCashReserves()).toBe(100000);
      expect(corporation.getOutstandingDebt()).toBe(0);
    });

    test('should clear a loan paid exactly', () => {
      const corporation = new Corporation('Acme', 'desc', true, 50000);
      const loan = corporation.takeLoan(10000);

      expect(corporation.makeLoanPayment(loan.id, 10000)).toBe(true);
      expect(corporation.loans).toHaveLength(0);
      expect(corporation.getTotalCashReserves()).toBe(50000);
    });

    test('should clear a loan left with a sub-credit residue', () => {
      const corporation = new Corporation('Acme', 'desc', true, 50000);
      const loan = corporation.takeLoan(10000);
      loan.remainingBalance = 10000.001;

      expect(corporation.makeLoanPayment(loan.id, 10000)).toBe(true);
      // An exact zero check would have left this behind as a zombie loan
      expect(corporation.loans).toHaveLength(0);
    });

    test('should reject a payment against a fully paid loan', () => {
      const corporation = new Corporation('Acme', 'desc', true, 50000);
      const loan = corporation.takeLoan(10000);
      corporation.makeLoanPayment(loan.id, 10000);

      expect(corporation.makeLoanPayment(loan.id, 100)).toBe(false);
    });

    test('should reject a payment it cannot afford', () => {
      const corporation = new Corporation('Acme', 'desc', true, 0);
      const loan = corporation.takeLoan(10000);
      corporation.spendCashReserve(10000);

      expect(corporation.makeLoanPayment(loan.id, 5000)).toBe(false);
      expect(corporation.getOutstandingDebt()).toBe(10000);
    });
  });

  describe('loanPaymentApplied', () => {
    test('should report the capped amount', () => {
      const corporation = new Corporation('Acme', 'desc', true, 100000);
      const loan = corporation.takeLoan(10000);

      expect(corporation.loanPaymentApplied(loan.id, 30000)).toBe(10000);
      expect(corporation.loanPaymentApplied(loan.id, 4000)).toBe(4000);
    });

    test('should return zero for unknown loans or bad amounts', () => {
      const corporation = new Corporation('Acme', 'desc', true, 100000);
      const loan = corporation.takeLoan(10000);

      expect(corporation.loanPaymentApplied(999, 100)).toBe(0);
      expect(corporation.loanPaymentApplied(loan.id, 0)).toBe(0);
      expect(corporation.loanPaymentApplied(loan.id, -5)).toBe(0);
      expect(corporation.loanPaymentApplied(loan.id, NaN)).toBe(0);
    });
  });

  describe('getCreditRating', () => {
    let universe;

    beforeEach(() => {
      universe = new Universe();
      universe.stellarObjects = [{ id: 1, value: 200000 }];
    });

    test('should rate a debt-free corporation at the top', () => {
      corporation.addCashReserve(1000);
      expect(corporation.getCreditRating(universe)).toBe(BEST);
    });

    test('should rate a bankrupt corporation at the bottom', () => {
      corporation.isBankrupt = true;
      expect(corporation.getCreditRating(universe)).toBe(WORST);
    });

    test('should rate on leverage rather than the size of the debt', () => {
      const small = new Corporation('Small', 'desc', false, 0);
      small.takeLoan(40000);
      small.spendCashReserve(39000);

      const large = new Corporation('Large', 'desc', false, 0);
      large.addStellarObject(1);
      large.takeLoan(100000);

      // The old ladder rated purely on debt size, so the heavily borrowed but
      // asset-rich company scored worse than the nearly-broke one
      expect(large.getOutstandingDebt()).toBeGreaterThan(small.getOutstandingDebt());
      expect(RATING_ORDER.indexOf(large.getCreditRating(universe)))
        .toBeLessThan(RATING_ORDER.indexOf(small.getCreditRating(universe)));
    });

    test('should worsen as leverage rises', () => {
      const ratings = [0.05, 0.3, 0.6, 0.9, 1.5].map(leverage => {
        const test = new Corporation('Test', 'desc', false, 0);
        test.addStellarObject(1);
        const principal = Math.round(200000 * leverage);
        test.takeLoan(principal);
        test.spendCashReserve(principal);
        return RATING_ORDER.indexOf(test.getCreditRating(universe));
      });

      for (let i = 1; i < ratings.length; i += 1) {
        expect(ratings[i]).toBeGreaterThanOrEqual(ratings[i - 1]);
      }
    });

    test('should rate an insolvent corporation at the bottom of the ladder', () => {
      corporation.takeLoan(100000);
      corporation.spendCashReserve(100000);

      // Debt with nothing behind it is a failure, not merely a bad ratio
      expect(corporation.getCreditRating(universe)).toBe(WORST);
    });

    test('should improve when debt is repaid', () => {
      corporation.addStellarObject(1);
      const loan = corporation.takeLoan(150000);
      const leveraged = corporation.getCreditRating(universe);

      corporation.makeLoanPayment(loan.id, 150000);

      expect(RATING_ORDER.indexOf(corporation.getCreditRating(universe)))
        .toBeLessThan(RATING_ORDER.indexOf(leveraged));
    });

    test('should fail a corporation that let a loan mature unpaid', () => {
      corporation.addStellarObject(1);
      corporation.takeLoan(10000, { originTick: 0, maturityTick: 100 });

      // Well covered by assets, so the ratios alone would rate it highly
      expect(corporation.getCreditRating(universe, {}, {}, { tick: 99 }))
        .not.toBe(WORST);
      expect(corporation.getCreditRating(universe, {}, {}, { tick: 101 }))
        .toBe(WORST);
    });

    test('should fall back to cash when no universe is supplied', () => {
      corporation.addCashReserve(100000);
      corporation.takeLoan(10000);

      expect(corporation.getCreditRating()).not.toBe(WORST);
      expect(RATING_ORDER).toContain(corporation.getCreditRating());
    });
  });

  describe('getInterestRate', () => {
    let universe;

    beforeEach(() => {
      universe = new Universe();
      universe.stellarObjects = [{ id: 1, value: 200000 }];
    });

    test('should charge the least to the best rated', () => {
      corporation.addCashReserve(1000);
      expect(corporation.getInterestRate(universe))
        .toBe(Corporation.interestRateForRating(BEST));
    });

    test('should charge more as the rating falls', () => {
      const sound = new Corporation('Sound', 'desc', false, 0);
      sound.addStellarObject(1);
      sound.takeLoan(20000);

      const strained = new Corporation('Strained', 'desc', false, 0);
      strained.addStellarObject(1);
      strained.takeLoan(180000);
      strained.spendCashReserve(180000);

      expect(strained.getInterestRate(universe))
        .toBeGreaterThan(sound.getInterestRate(universe));
    });

    test('should define a rate for every rating on the ladder', () => {
      RATING_ORDER.forEach(rating => {
        expect(Corporation.interestRateForRating(rating)).toBeGreaterThan(0);
      });
    });
  });

  describe('getCompanyManagementState rounding', () => {
    test('should round figures that interest accrual makes fractional', () => {
      const universe = new Universe();
      universe.stellarObjects = [{ id: 1, value: 80000 }];

      corporation.addStellarObject(1);
      corporation.takeLoan(60000, { universe });
      corporation.accrueLoanInterest(8640, 500);

      const state = corporation.getCompanyManagementState(universe);

      // Interest accrues fractionally, so these would otherwise reach the
      // interface as figures like -183906.89224400593
      expect(Number.isInteger(state.value)).toBe(true);
      expect(Number.isInteger(state.assetValue)).toBe(true);
      expect(Number.isInteger(state.outstandingDebt)).toBe(true);
      expect(Number.isInteger(state.totalCashReserves)).toBe(true);
    });

    test('should leave the underlying methods precise', () => {
      const universe = new Universe();
      universe.stellarObjects = [{ id: 1, value: 80000 }];

      corporation.addStellarObject(1);
      corporation.takeLoan(60000, { universe });
      corporation.accrueLoanInterest(8640, 500);

      expect(Number.isInteger(corporation.getOutstandingDebt())).toBe(false);
    });
  });
});
