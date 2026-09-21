const { Portfolio } = require('./portfolio');
const { corporationHolder, playerHolder, INVESTOR_POOL_HOLDER, holderKey } = require('../economy/accounts');

const PLAYER = playerHolder('Trader');
const ACME = corporationHolder('Acme Orbital');

describe('Portfolio', () => {
  test('should start empty', () => {
    const portfolio = new Portfolio();
    expect(portfolio.sharesHeld(PLAYER, 'Meridian')).toBe(0);
    expect(portfolio.positionsFor(PLAYER)).toEqual({});
    expect(portfolio.capTable('Meridian')).toEqual([]);
  });

  describe('adjust', () => {
    test('should accumulate a position', () => {
      const portfolio = new Portfolio();
      portfolio.adjust(PLAYER, 'Meridian', 100);
      portfolio.adjust(PLAYER, 'Meridian', 50);
      expect(portfolio.sharesHeld(PLAYER, 'Meridian')).toBe(150);
    });

    test('should reduce and clear a position', () => {
      const portfolio = new Portfolio();
      portfolio.adjust(PLAYER, 'Meridian', 100);
      portfolio.adjust(PLAYER, 'Meridian', -100);

      expect(portfolio.sharesHeld(PLAYER, 'Meridian')).toBe(0);
      // A zeroed position is dropped rather than left as clutter
      expect(portfolio.positionsFor(PLAYER)).toEqual({});
    });

    test('should ignore a zero adjustment', () => {
      const portfolio = new Portfolio();
      portfolio.adjust(PLAYER, 'Meridian', 0);
      expect(portfolio.positionsFor(PLAYER)).toEqual({});
    });

    test('should keep holders and listings separate', () => {
      const portfolio = new Portfolio();
      portfolio.adjust(PLAYER, 'Meridian', 100);
      portfolio.adjust(PLAYER, 'Acme Orbital', 20);
      portfolio.adjust(ACME, 'Meridian', 5);

      expect(portfolio.positionsFor(PLAYER)).toEqual({ Meridian: 100, 'Acme Orbital': 20 });
      expect(portfolio.sharesHeld(ACME, 'Meridian')).toBe(5);
    });

    test('should hold positions for any holder kind on one table', () => {
      const portfolio = new Portfolio();
      portfolio.adjust(PLAYER, 'Meridian', 300);
      portfolio.adjust(ACME, 'Meridian', 200);
      portfolio.adjust(INVESTOR_POOL_HOLDER, 'Meridian', 9500);

      // Personal, corporate and public holdings share one register, which is
      // what makes a takeover a matter of who accumulates enough
      expect(portfolio.capTable('Meridian').map(row => row.shares)).toEqual([9500, 300, 200]);
    });
  });

  describe('capTable', () => {
    test('should order by size then by holder', () => {
      const portfolio = new Portfolio();
      portfolio.adjust(playerHolder('Zed'), 'Meridian', 100);
      portfolio.adjust(playerHolder('Amy'), 'Meridian', 100);
      portfolio.adjust(playerHolder('Big'), 'Meridian', 500);

      const table = portfolio.capTable('Meridian');
      expect(table[0].holder.id).toBe('Big');
      // Equal holdings do not reorder between runs
      expect(table[1].holder.id).toBe('Amy');
      expect(table[2].holder.id).toBe('Zed');
    });

    test('should exclude holders with no position', () => {
      const portfolio = new Portfolio();
      portfolio.adjust(PLAYER, 'Meridian', 100);
      portfolio.adjust(PLAYER, 'Meridian', -100);
      expect(portfolio.capTable('Meridian')).toEqual([]);
    });
  });

  describe('totalHeld and ownershipFraction', () => {
    test('should total every holding in a listing', () => {
      const portfolio = new Portfolio();
      portfolio.adjust(PLAYER, 'Meridian', 300);
      portfolio.adjust(INVESTOR_POOL_HOLDER, 'Meridian', 9700);

      // The reconciliation that catches shares being created by a bad fill
      expect(portfolio.totalHeld('Meridian')).toBe(10000);
    });

    test('should express a holding as a fraction of the company', () => {
      const portfolio = new Portfolio();
      portfolio.adjust(PLAYER, 'Meridian', 2500);
      expect(portfolio.ownershipFraction(PLAYER, 'Meridian', 10000)).toBe(0.25);
    });

    test('should return zero ownership when nothing is outstanding', () => {
      expect(new Portfolio().ownershipFraction(PLAYER, 'Meridian', 0)).toBe(0);
    });
  });

  describe('serialization', () => {
    test('should round trip positions', () => {
      const portfolio = new Portfolio();
      portfolio.adjust(PLAYER, 'Meridian', 300);
      portfolio.adjust(ACME, 'Meridian', -50);

      const restored = Portfolio.fromJSON(JSON.parse(JSON.stringify(portfolio.toJSON())));

      expect(restored.sharesHeld(PLAYER, 'Meridian')).toBe(300);
      expect(restored.sharesHeld(ACME, 'Meridian')).toBe(-50);
    });

    test('should drop emptied positions from the save', () => {
      const portfolio = new Portfolio();
      portfolio.adjust(PLAYER, 'Meridian', 100);
      portfolio.adjust(PLAYER, 'Meridian', -100);

      expect(portfolio.toJSON().holders).toEqual([]);
    });

    test('should emit holders and listings in stable sorted order', () => {
      const portfolio = new Portfolio();
      portfolio.adjust(playerHolder('Zed'), 'Zeta', 1);
      portfolio.adjust(playerHolder('Amy'), 'Beta', 1);
      portfolio.adjust(playerHolder('Amy'), 'Alpha', 1);

      const block = portfolio.toJSON();
      expect(block.holders.map(entry => entry.holder))
        .toEqual([holderKey(playerHolder('Amy')), holderKey(playerHolder('Zed'))]);
      expect(Object.keys(block.holders[0].positions)).toEqual(['Alpha', 'Beta']);
    });

    test('should produce byte-identical output for identical runs', () => {
      const run = () => {
        const portfolio = new Portfolio();
        for (let i = 1; i <= 20; i += 1) {
          portfolio.adjust(playerHolder(`h${i}`), 'Meridian', i * 7);
        }
        return JSON.stringify(portfolio.toJSON());
      };
      expect(run()).toBe(run());
    });

    test('should return a usable store from missing or malformed data', () => {
      expect(Portfolio.fromJSON(undefined).sharesHeld(PLAYER, 'Meridian')).toBe(0);
      expect(Portfolio.fromJSON({ holders: [{ holder: null }, { positions: {} }] })
        .capTable('Meridian')).toEqual([]);
    });
  });
});
