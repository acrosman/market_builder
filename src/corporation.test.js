const { Corporation } = require('./corporation');
const { Universe, System, StellarObject } = require('./universe');

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
      expect(corporation.cashReserves).toEqual({
        trade: 0,
        buildings: 0,
        planets: 0,
        stocks: 0,
        ships: 0,
        operations: 0
      });
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
    test('should add and spend cash reserves by category', () => {
      expect(corporation.addCashReserve('trade', 1000)).toBe(true);
      expect(corporation.cashReserves.trade).toBe(1000);

      expect(corporation.spendCashReserve('trade', 250)).toBe(true);
      expect(corporation.cashReserves.trade).toBe(750);
    });

    test('should fail to spend more than available cash reserves', () => {
      corporation.addCashReserve('ships', 100);
      expect(corporation.spendCashReserve('ships', 200)).toBe(false);
      expect(corporation.cashReserves.ships).toBe(100);
    });

    test('should reject unknown reserve categories', () => {
      expect(corporation.addCashReserve('unknown', 50)).toBe(false);
      expect(corporation.spendCashReserve('unknown', 10)).toBe(false);
    });

    test('should calculate total cash reserves across all categories', () => {
      corporation.addCashReserve('trade', 400);
      corporation.addCashReserve('buildings', 600);
      corporation.addCashReserve('stocks', 250);
      expect(corporation.getTotalCashReserves()).toBe(1250);
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
      corporation.addCashReserve('operations', 500);

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
});
