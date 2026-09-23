const { EconomyState } = require('./economyState');
const { RandomSource } = require('./rng');
const { Ledger } = require('./ledger');
const { CostBasis } = require('./costBasis');
const { ACCOUNTS, corporationHolder } = require('./accounts');

const ACME = corporationHolder('Acme Orbital');

/**
 * Post a purchase to both the ledger and the cost basis, the way callers must.
 * @param {EconomyState} economy - Economy state to record into.
 * @param {number} quantity - Units purchased.
 * @param {number} totalCost - Credits paid.
 * @returns {void}
 */
function recordPurchase(economy, quantity, totalCost) {
  economy.getLedger().post({
    tick: 1,
    amount: totalCost,
    debit: { holder: ACME, account: ACCOUNTS.INVENTORY },
    credit: { holder: ACME, account: ACCOUNTS.CASH },
    kind: 'goods_purchase'
  });
  economy.getCostBasis().acquire(ACME, 'metal', quantity, totalCost);
}

describe('EconomyState', () => {
  describe('construction', () => {
    test('should build a random source from an explicit seed', () => {
      const economy = new EconomyState({ seed: 'game-0001' });
      expect(economy.getRandom()).toBeInstanceOf(RandomSource);
      expect(economy.getRandom().seed).toBe(new RandomSource('game-0001').seed);
    });

    test('should generate a seed when none is given', () => {
      const economy = new EconomyState();
      expect(Number.isFinite(economy.getRandom().seed)).toBe(true);
    });

    test('should accept a numeric seed', () => {
      expect(new EconomyState({ seed: 99 }).getRandom().seed).toBe(99);
    });

    test('should give identical streams for identical seeds', () => {
      const a = new EconomyState({ seed: 'twin' });
      const b = new EconomyState({ seed: 'twin' });
      expect(a.getRandom().stream('price-noise').next())
        .toBe(b.getRandom().stream('price-noise').next());
    });

    test('should start with an empty ledger and cost basis', () => {
      const economy = new EconomyState({ seed: 1 });
      expect(economy.getLedger()).toBeInstanceOf(Ledger);
      expect(economy.getCostBasis()).toBeInstanceOf(CostBasis);
      expect(economy.getLedger().entries).toEqual([]);
      expect(economy.getCostBasis().holderPositions(ACME)).toEqual({});
    });
  });

  describe('toJSON', () => {
    test('should include the random source state', () => {
      const economy = new EconomyState({ seed: 1 });
      economy.getRandom().stream('price-noise').next();

      const block = economy.toJSON();
      expect(block.random.seed).toBe(1);
      expect(block.random.streams).toHaveLength(1);
      expect(block.random.streams[0].name).toBe('price-noise');
    });

    test('should survive JSON serialization', () => {
      const economy = new EconomyState({ seed: 1 });
      economy.getRandom().stream('price-noise').next();
      expect(() => JSON.parse(JSON.stringify(economy.toJSON()))).not.toThrow();
    });
  });

  describe('fromJSON', () => {
    test('should resume streams exactly mid-sequence', () => {
      const original = new EconomyState({ seed: 'resume' });
      const stream = original.getRandom().stream('price-noise');
      for (let i = 0; i < 9; i += 1) {
        stream.next();
      }

      const restored = EconomyState.fromJSON(
        JSON.parse(JSON.stringify(original.toJSON()))
      );

      expect(restored.getRandom().stream('price-noise').next()).toBe(stream.next());
    });

    test('should return fresh state for a save with no economy block', () => {
      const economy = EconomyState.fromJSON(undefined);
      expect(economy).toBeInstanceOf(EconomyState);
      expect(Number.isFinite(economy.getRandom().stream('x').next())).toBe(true);
    });

    test('should return fresh state for an empty object', () => {
      const economy = EconomyState.fromJSON({});
      expect(Number.isFinite(economy.getRandom().stream('x').next())).toBe(true);
    });

    test('should preserve the seed across a round trip', () => {
      const original = new EconomyState({ seed: 7777 });
      const restored = EconomyState.fromJSON(original.toJSON());
      expect(restored.getRandom().seed).toBe(7777);
    });

    test('should tolerate an economy block with no streams drawn yet', () => {
      const original = new EconomyState({ seed: 5 });
      const restored = EconomyState.fromJSON(JSON.parse(JSON.stringify(original.toJSON())));

      expect(restored.getRandom().stream('price-noise').next())
        .toBe(original.getRandom().stream('price-noise').next());
    });

    test('should restore an empty ledger and cost basis for an old save', () => {
      const economy = EconomyState.fromJSON(undefined);
      expect(economy.getLedger()).toBeInstanceOf(Ledger);
      expect(economy.getCostBasis()).toBeInstanceOf(CostBasis);
      expect(economy.getLedger().entries).toEqual([]);
    });
  });

  describe('ledger and cost basis persistence', () => {
    test('should round trip the ledger with its balances intact', () => {
      const economy = new EconomyState({ seed: 1 });
      recordPurchase(economy, 100, 1200);

      const restored = EconomyState.fromJSON(
        JSON.parse(JSON.stringify(economy.toJSON()))
      );

      expect(restored.getLedger().entries).toHaveLength(1);
      expect(restored.getLedger().balance(ACME, ACCOUNTS.INVENTORY)).toBe(1200);
      expect(restored.getLedger().balance(ACME, ACCOUNTS.CASH)).toBe(-1200);
      expect(restored.getLedger().audit().balancesMatch).toBe(true);
    });

    test('should round trip the cost basis', () => {
      const economy = new EconomyState({ seed: 1 });
      recordPurchase(economy, 100, 1200);
      economy.getCostBasis().consume(ACME, 'metal', 30);

      const restored = EconomyState.fromJSON(
        JSON.parse(JSON.stringify(economy.toJSON()))
      );

      expect(restored.getCostBasis().quantity(ACME, 'metal')).toBe(70);
      expect(restored.getCostBasis().totalCost(ACME, 'metal')).toBe(840);
    });

    test('should keep the cost basis in step with the inventory account', () => {
      const economy = new EconomyState({ seed: 1 });
      recordPurchase(economy, 100, 1200);
      recordPurchase(economy, 100, 1800);

      const ledger = economy.getLedger();
      const basis = economy.getCostBasis();

      expect(basis.holderInventoryValue(ACME))
        .toBe(ledger.balance(ACME, ACCOUNTS.INVENTORY));

      // Selling everything must zero both sides, leaving no residue
      const { cost } = basis.consume(ACME, 'metal', 200);
      ledger.post({
        tick: 2,
        amount: cost,
        debit: { holder: ACME, account: ACCOUNTS.COGS },
        credit: { holder: ACME, account: ACCOUNTS.INVENTORY },
        kind: 'cost_of_sale'
      });

      expect(basis.holderInventoryValue(ACME)).toBe(0);
      expect(ledger.balance(ACME, ACCOUNTS.INVENTORY)).toBe(0);
    });

    test('should produce byte-identical output for identical runs', () => {
      const run = () => {
        const economy = new EconomyState({ seed: 'identical' });
        for (let i = 1; i <= 10; i += 1) {
          recordPurchase(economy, i, i * 13);
          economy.getCostBasis().consume(ACME, 'metal', 1);
          economy.getRandom().stream('price-noise').next();
        }
        return JSON.stringify(economy.toJSON());
      };

      expect(run()).toBe(run());
    });
  });
});
