const { Trader } = require('./trader');

describe('Trader', () => {
  describe('constructor', () => {
    it('should create a trader with default values', () => {
      const trader = new Trader('test-1', 1, 'Shuttle');
      expect(trader.id).toBe('test-1');
      expect(trader.location).toBe(1);
      expect(trader.ship).toBe('Shuttle');
      expect(trader.credits).toBe(1000);
      expect(trader.cargo).toEqual({});
    });

    it('should create a trader with custom credits', () => {
      const trader = new Trader('test-1', 1, 'Shuttle', 5000);
      expect(trader.credits).toBe(5000);
    });
  });

  describe('moveTo', () => {
    it('should update location', () => {
      const trader = new Trader('test-1', 1, 'Shuttle');
      trader.moveTo(3);
      expect(trader.location).toBe(3);
    });
  });

  describe('credits management', () => {
    let trader;

    beforeEach(() => {
      trader = new Trader('test-1', 1, 'Shuttle', 1000);
    });

    describe('canAfford', () => {
      it('should return true when trader has enough credits', () => {
        expect(trader.canAfford(500)).toBe(true);
        expect(trader.canAfford(1000)).toBe(true);
      });

      it('should return false when trader does not have enough credits', () => {
        expect(trader.canAfford(1001)).toBe(false);
        expect(trader.canAfford(2000)).toBe(false);
      });
    });

    describe('addCredits', () => {
      it('should increase credits', () => {
        trader.addCredits(500);
        expect(trader.credits).toBe(1500);
      });

      it('should handle multiple additions', () => {
        trader.addCredits(100);
        trader.addCredits(200);
        expect(trader.credits).toBe(1300);
      });
    });

    describe('removeCredits', () => {
      it('should decrease credits when affordable', () => {
        const result = trader.removeCredits(500);
        expect(result).toBe(true);
        expect(trader.credits).toBe(500);
      });

      it('should not decrease credits when unaffordable', () => {
        const result = trader.removeCredits(1500);
        expect(result).toBe(false);
        expect(trader.credits).toBe(1000);
      });

      it('should allow removing exact credit amount', () => {
        const result = trader.removeCredits(1000);
        expect(result).toBe(true);
        expect(trader.credits).toBe(0);
      });
    });
  });

  describe('cargo management', () => {
    let trader;

    beforeEach(() => {
      trader = new Trader('test-1', 1, 'Shuttle', 1000);
    });

    describe('addCargo', () => {
      it('should add new cargo item', () => {
        trader.addCargo('Iron', 10);
        expect(trader.cargo.Iron).toBe(10);
      });

      it('should increase existing cargo quantity', () => {
        trader.addCargo('Iron', 10);
        trader.addCargo('Iron', 5);
        expect(trader.cargo.Iron).toBe(15);
      });

      it('should add multiple different goods', () => {
        trader.addCargo('Iron', 10);
        trader.addCargo('Gold', 5);
        expect(trader.cargo.Iron).toBe(10);
        expect(trader.cargo.Gold).toBe(5);
      });
    });

    describe('removeCargo', () => {
      beforeEach(() => {
        trader.cargo = { Iron: 10, Gold: 5 };
      });

      it('should remove cargo when sufficient quantity exists', () => {
        const result = trader.removeCargo('Iron', 5);
        expect(result).toBe(true);
        expect(trader.cargo.Iron).toBe(5);
      });

      it('should delete cargo entry when quantity reaches zero', () => {
        const result = trader.removeCargo('Gold', 5);
        expect(result).toBe(true);
        expect(trader.cargo.Gold).toBeUndefined();
      });

      it('should return false when insufficient quantity', () => {
        const result = trader.removeCargo('Iron', 15);
        expect(result).toBe(false);
        expect(trader.cargo.Iron).toBe(10);
      });

      it('should return false when good does not exist', () => {
        const result = trader.removeCargo('Platinum', 1);
        expect(result).toBe(false);
      });
    });

    describe('getCargoQuantity', () => {
      it('should return quantity for existing good', () => {
        trader.cargo = { Iron: 10 };
        expect(trader.getCargoQuantity('Iron')).toBe(10);
      });

      it('should return 0 for non-existent good', () => {
        expect(trader.getCargoQuantity('Platinum')).toBe(0);
      });
    });
  });
});
