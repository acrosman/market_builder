const { CostBasis } = require('./costBasis');
const { corporationHolder, holderKey } = require('./accounts');

const ACME = corporationHolder('Acme Orbital');
const RIVAL = corporationHolder('Rival Freight');

describe('CostBasis', () => {
  describe('acquire', () => {
    test('should record a first purchase', () => {
      const basis = new CostBasis();
      basis.acquire(ACME, 'metal', 100, 1200);

      expect(basis.quantity(ACME, 'metal')).toBe(100);
      expect(basis.totalCost(ACME, 'metal')).toBe(1200);
      expect(basis.averageCost(ACME, 'metal')).toBe(12);
    });

    test('should blend purchases into a weighted average', () => {
      const basis = new CostBasis();
      basis.acquire(ACME, 'metal', 100, 1200); // 12 each
      basis.acquire(ACME, 'metal', 100, 1800); // 18 each

      expect(basis.quantity(ACME, 'metal')).toBe(200);
      expect(basis.totalCost(ACME, 'metal')).toBe(3000);
      expect(basis.averageCost(ACME, 'metal')).toBe(15);
    });

    test('should keep holders and goods separate', () => {
      const basis = new CostBasis();
      basis.acquire(ACME, 'metal', 10, 100);
      basis.acquire(ACME, 'food', 10, 500);
      basis.acquire(RIVAL, 'metal', 10, 900);

      expect(basis.averageCost(ACME, 'metal')).toBe(10);
      expect(basis.averageCost(ACME, 'food')).toBe(50);
      expect(basis.averageCost(RIVAL, 'metal')).toBe(90);
    });

    test('should accept a zero total cost', () => {
      const basis = new CostBasis();
      basis.acquire(ACME, 'metal', 10, 0);
      expect(basis.averageCost(ACME, 'metal')).toBe(0);
    });

    test('should reject invalid quantities', () => {
      const basis = new CostBasis();
      expect(() => basis.acquire(ACME, 'metal', 0, 100)).toThrow(/positive integer/);
      expect(() => basis.acquire(ACME, 'metal', -5, 100)).toThrow(/positive integer/);
      expect(() => basis.acquire(ACME, 'metal', 1.5, 100)).toThrow(/positive integer/);
    });

    test('should reject invalid costs', () => {
      const basis = new CostBasis();
      expect(() => basis.acquire(ACME, 'metal', 10, -1)).toThrow(/non-negative integer/);
      expect(() => basis.acquire(ACME, 'metal', 10, 5.5)).toThrow(/non-negative integer/);
    });

    test('should accept a holder key string', () => {
      const basis = new CostBasis();
      basis.acquire(holderKey(ACME), 'metal', 10, 100);
      expect(basis.quantity(ACME, 'metal')).toBe(10);
    });
  });

  describe('consume', () => {
    test('should release prorated cost on a partial sale', () => {
      const basis = new CostBasis();
      basis.acquire(ACME, 'metal', 100, 1200);

      expect(basis.consume(ACME, 'metal', 30)).toEqual({ quantity: 30, cost: 360 });
      expect(basis.quantity(ACME, 'metal')).toBe(70);
      expect(basis.totalCost(ACME, 'metal')).toBe(840);
    });

    test('should release exactly the recorded cost on a full sale', () => {
      const basis = new CostBasis();
      basis.acquire(ACME, 'metal', 100, 1200);

      expect(basis.consume(ACME, 'metal', 100)).toEqual({ quantity: 100, cost: 1200 });
      expect(basis.quantity(ACME, 'metal')).toBe(0);
      expect(basis.totalCost(ACME, 'metal')).toBe(0);
    });

    test('should clamp to what is held when asked for more', () => {
      const basis = new CostBasis();
      basis.acquire(ACME, 'metal', 40, 500);

      expect(basis.consume(ACME, 'metal', 999)).toEqual({ quantity: 40, cost: 500 });
      expect(basis.quantity(ACME, 'metal')).toBe(0);
    });

    test('should return nothing for an unheld good or holder', () => {
      const basis = new CostBasis();
      expect(basis.consume(ACME, 'metal', 10)).toEqual({ quantity: 0, cost: 0 });

      basis.acquire(ACME, 'metal', 5, 50);
      expect(basis.consume(ACME, 'food', 10)).toEqual({ quantity: 0, cost: 0 });
      expect(basis.consume(RIVAL, 'metal', 10)).toEqual({ quantity: 0, cost: 0 });
    });

    test('should return nothing for invalid quantities', () => {
      const basis = new CostBasis();
      basis.acquire(ACME, 'metal', 10, 100);

      expect(basis.consume(ACME, 'metal', 0)).toEqual({ quantity: 0, cost: 0 });
      expect(basis.consume(ACME, 'metal', -5)).toEqual({ quantity: 0, cost: 0 });
      expect(basis.consume(ACME, 'metal', 2.5)).toEqual({ quantity: 0, cost: 0 });
      expect(basis.quantity(ACME, 'metal')).toBe(10);
    });

    test('should leave no residue after many awkward partial sales', () => {
      const basis = new CostBasis();
      // A total cost that does not divide evenly by quantity
      basis.acquire(ACME, 'metal', 97, 1234);

      let released = 0;
      // Sell in sevens until fewer than seven remain
      while (basis.quantity(ACME, 'metal') >= 7) {
        released += basis.consume(ACME, 'metal', 7).cost;
      }
      released += basis.consume(ACME, 'metal', basis.quantity(ACME, 'metal')).cost;

      // Everything acquired is eventually released, to the credit
      expect(released).toBe(1234);
      expect(basis.quantity(ACME, 'metal')).toBe(0);
      expect(basis.totalCost(ACME, 'metal')).toBe(0);
    });

    test('should conserve cost across interleaved buys and sells', () => {
      const basis = new CostBasis();
      let acquired = 0;
      let released = 0;

      for (let i = 1; i <= 40; i += 1) {
        const cost = 100 + (i * 7);
        basis.acquire(ACME, 'metal', 13, cost);
        acquired += cost;
        released += basis.consume(ACME, 'metal', 5).cost;
      }

      released += basis.consume(ACME, 'metal', basis.quantity(ACME, 'metal')).cost;

      expect(released).toBe(acquired);
      expect(basis.totalCost(ACME, 'metal')).toBe(0);
    });

    test('should always release integer costs', () => {
      const basis = new CostBasis();
      basis.acquire(ACME, 'metal', 3, 10);

      const first = basis.consume(ACME, 'metal', 1);
      expect(Number.isInteger(first.cost)).toBe(true);
      expect(Number.isInteger(basis.totalCost(ACME, 'metal'))).toBe(true);
    });
  });

  describe('averageCost', () => {
    test('should return 0 when nothing is held', () => {
      const basis = new CostBasis();
      expect(basis.averageCost(ACME, 'metal')).toBe(0);

      basis.acquire(ACME, 'metal', 10, 100);
      basis.consume(ACME, 'metal', 10);
      expect(basis.averageCost(ACME, 'metal')).toBe(0);
    });

    test('should not round the per-unit figure', () => {
      const basis = new CostBasis();
      basis.acquire(ACME, 'metal', 3, 10);
      expect(basis.averageCost(ACME, 'metal')).toBeCloseTo(10 / 3, 10);
    });
  });

  describe('holderPositions and holderInventoryValue', () => {
    test('should report every non-empty position', () => {
      const basis = new CostBasis();
      basis.acquire(ACME, 'metal', 10, 100);
      basis.acquire(ACME, 'food', 20, 400);

      expect(basis.holderPositions(ACME)).toEqual({
        metal: { quantity: 10, totalCost: 100 },
        food: { quantity: 20, totalCost: 400 }
      });
      expect(basis.holderInventoryValue(ACME)).toBe(500);
    });

    test('should exclude emptied positions', () => {
      const basis = new CostBasis();
      basis.acquire(ACME, 'metal', 10, 100);
      basis.consume(ACME, 'metal', 10);

      expect(basis.holderPositions(ACME)).toEqual({});
      expect(basis.holderInventoryValue(ACME)).toBe(0);
    });

    test('should return empties for an unknown holder', () => {
      const basis = new CostBasis();
      expect(basis.holderPositions(RIVAL)).toEqual({});
      expect(basis.holderInventoryValue(RIVAL)).toBe(0);
    });

    test('should not expose mutable internal state', () => {
      const basis = new CostBasis();
      basis.acquire(ACME, 'metal', 10, 100);

      const positions = basis.holderPositions(ACME);
      positions.metal.quantity = 9999;

      expect(basis.quantity(ACME, 'metal')).toBe(10);
    });
  });

  describe('serialization', () => {
    test('should round trip positions', () => {
      const basis = new CostBasis();
      basis.acquire(ACME, 'metal', 100, 1200);
      basis.acquire(ACME, 'food', 50, 900);
      basis.acquire(RIVAL, 'metal', 10, 500);
      basis.consume(ACME, 'metal', 30);

      const restored = CostBasis.fromJSON(JSON.parse(JSON.stringify(basis.toJSON())));

      expect(restored.quantity(ACME, 'metal')).toBe(70);
      expect(restored.totalCost(ACME, 'metal')).toBe(840);
      expect(restored.quantity(ACME, 'food')).toBe(50);
      expect(restored.quantity(RIVAL, 'metal')).toBe(10);
    });

    test('should drop emptied positions from the save', () => {
      const basis = new CostBasis();
      basis.acquire(ACME, 'metal', 10, 100);
      basis.consume(ACME, 'metal', 10);

      expect(basis.toJSON().holders).toEqual([]);
    });

    test('should emit holders and goods in stable sorted order', () => {
      const basis = new CostBasis();
      basis.acquire(RIVAL, 'zinc', 1, 1);
      basis.acquire(ACME, 'metal', 1, 1);
      basis.acquire(ACME, 'food', 1, 1);

      const block = basis.toJSON();
      expect(block.holders.map(h => h.holder)).toEqual([
        'corporation:Acme Orbital',
        'corporation:Rival Freight'
      ]);
      expect(Object.keys(block.holders[0].goods)).toEqual(['food', 'metal']);
    });

    test('should produce byte-identical output for identical runs', () => {
      const run = () => {
        const basis = new CostBasis();
        for (let i = 1; i <= 20; i += 1) {
          basis.acquire(ACME, 'metal', i, i * 11);
          basis.consume(ACME, 'metal', Math.max(1, i - 3));
        }
        return JSON.stringify(basis.toJSON());
      };

      expect(run()).toBe(run());
    });

    test('should return a usable tracker from missing data', () => {
      const basis = CostBasis.fromJSON(undefined);
      expect(basis.quantity(ACME, 'metal')).toBe(0);
      basis.acquire(ACME, 'metal', 5, 50);
      expect(basis.averageCost(ACME, 'metal')).toBe(10);
    });

    test('should skip malformed holder records', () => {
      const basis = CostBasis.fromJSON({
        holders: [
          { holder: null, goods: { metal: { quantity: 1, totalCost: 1 } } },
          { holder: 'corporation:Acme Orbital', goods: null },
          { holder: 'corporation:Acme Orbital', goods: { metal: { quantity: 4, totalCost: 40 } } }
        ]
      });

      expect(basis.quantity(ACME, 'metal')).toBe(4);
    });

    test('should coerce malformed position numbers to zero', () => {
      const basis = CostBasis.fromJSON({
        holders: [
          { holder: 'corporation:Acme Orbital', goods: { metal: { quantity: 'x', totalCost: null } } }
        ]
      });

      expect(basis.quantity(ACME, 'metal')).toBe(0);
      expect(basis.totalCost(ACME, 'metal')).toBe(0);
    });
  });
});
