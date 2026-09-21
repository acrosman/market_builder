const { EconomyState, ECONOMY_SCHEMA_VERSION } = require('./economyState');
const { RandomSource } = require('./rng');

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
  });

  describe('toJSON', () => {
    test('should carry its own schema version', () => {
      const block = new EconomyState({ seed: 1 }).toJSON();
      expect(block.schemaVersion).toBe(ECONOMY_SCHEMA_VERSION);
    });

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
  });
});
