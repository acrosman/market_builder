const { RandomSource, RandomStream, hashString, normalizeSeed } = require('./rng');

describe('hashString', () => {
  test('should be stable for the same input', () => {
    expect(hashString('price-noise')).toBe(hashString('price-noise'));
  });

  test('should differ for different inputs', () => {
    expect(hashString('price-noise')).not.toBe(hashString('investor-beliefs'));
  });

  test('should return an unsigned 32-bit integer', () => {
    const hash = hashString('anything');
    expect(Number.isInteger(hash)).toBe(true);
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThan(2 ** 32);
  });

  test('should handle the empty string', () => {
    expect(Number.isInteger(hashString(''))).toBe(true);
  });
});

describe('normalizeSeed', () => {
  test('should hash strings', () => {
    expect(normalizeSeed('alpha')).toBe(hashString('alpha'));
  });

  test('should pass through finite numbers', () => {
    expect(normalizeSeed(12345)).toBe(12345);
  });

  test('should truncate and absolute non-integers', () => {
    expect(normalizeSeed(-7.9)).toBe(7);
  });

  test('should return 0 for non-finite values', () => {
    expect(normalizeSeed(NaN)).toBe(0);
    expect(normalizeSeed(Infinity)).toBe(0);
    expect(normalizeSeed(undefined)).toBe(0);
    expect(normalizeSeed(null)).toBe(0);
  });
});

describe('RandomStream', () => {
  test('should produce floats within [0, 1)', () => {
    const stream = new RandomStream('test', 1);
    for (let i = 0; i < 1000; i += 1) {
      const value = stream.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  test('should produce the same sequence from the same seed', () => {
    const a = new RandomStream('test', 42);
    const b = new RandomStream('test', 42);
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  test('should produce different sequences from different seeds', () => {
    const a = new RandomStream('test', 1);
    const b = new RandomStream('test', 2);
    expect(a.next()).not.toBe(b.next());
  });

  test('should not get stuck on a single value', () => {
    const stream = new RandomStream('test', 7);
    const values = new Set(Array.from({ length: 100 }, () => stream.next()));
    expect(values.size).toBeGreaterThan(90);
  });

  describe('float', () => {
    test('should stay within bounds', () => {
      const stream = new RandomStream('test', 3);
      for (let i = 0; i < 500; i += 1) {
        const value = stream.float(0.7, 1.3);
        expect(value).toBeGreaterThanOrEqual(0.7);
        expect(value).toBeLessThan(1.3);
      }
    });
  });

  describe('int', () => {
    test('should stay within inclusive bounds', () => {
      const stream = new RandomStream('test', 5);
      for (let i = 0; i < 500; i += 1) {
        const value = stream.int(1, 20);
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(1);
        expect(value).toBeLessThanOrEqual(20);
      }
    });

    test('should eventually hit both endpoints', () => {
      const stream = new RandomStream('test', 11);
      const seen = new Set(Array.from({ length: 500 }, () => stream.int(1, 3)));
      expect(seen).toEqual(new Set([1, 2, 3]));
    });

    test('should return the low bound when the range is empty', () => {
      const stream = new RandomStream('test', 1);
      expect(stream.int(5, 5)).toBe(5);
      expect(stream.int(5, 2)).toBe(5);
    });
  });

  describe('pick', () => {
    test('should return an element of the array', () => {
      const stream = new RandomStream('test', 13);
      const items = ['metal', 'food', 'chemicals'];
      for (let i = 0; i < 50; i += 1) {
        expect(items).toContain(stream.pick(items));
      }
    });

    test('should return undefined for empty or invalid input', () => {
      const stream = new RandomStream('test', 1);
      expect(stream.pick([])).toBeUndefined();
      expect(stream.pick(null)).toBeUndefined();
    });
  });

  describe('shuffle', () => {
    test('should preserve all elements without mutating the input', () => {
      const stream = new RandomStream('test', 17);
      const original = [1, 2, 3, 4, 5, 6, 7, 8];
      const shuffled = stream.shuffle(original);

      expect(original).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect([...shuffled].sort((a, b) => a - b)).toEqual(original);
    });

    test('should be deterministic for a given seed', () => {
      const a = new RandomStream('test', 23).shuffle([1, 2, 3, 4, 5]);
      const b = new RandomStream('test', 23).shuffle([1, 2, 3, 4, 5]);
      expect(a).toEqual(b);
    });

    test('should return an empty array for invalid input', () => {
      expect(new RandomStream('test', 1).shuffle(null)).toEqual([]);
    });
  });

  describe('normal', () => {
    test('should approximate the requested mean and deviation', () => {
      const stream = new RandomStream('test', 29);
      const samples = Array.from({ length: 20000 }, () => stream.normal(5, 2));
      const mean = samples.reduce((sum, v) => sum + v, 0) / samples.length;
      const variance = samples.reduce((sum, v) => sum + ((v - mean) ** 2), 0) / samples.length;

      expect(mean).toBeCloseTo(5, 1);
      expect(Math.sqrt(variance)).toBeCloseTo(2, 1);
    });

    test('should always return a finite number', () => {
      const stream = new RandomStream('test', 31);
      for (let i = 0; i < 2000; i += 1) {
        expect(Number.isFinite(stream.normal())).toBe(true);
      }
    });

    test('should be deterministic for a given seed', () => {
      const a = new RandomStream('test', 37);
      const b = new RandomStream('test', 37);
      expect(a.normal()).toBe(b.normal());
    });
  });

  describe('serialization', () => {
    test('should resume the identical sequence after a round trip', () => {
      const original = new RandomStream('test', 41);
      // Advance partway through the sequence before saving
      for (let i = 0; i < 17; i += 1) {
        original.next();
      }

      const restored = RandomStream.fromJSON(JSON.parse(JSON.stringify(original.toJSON())));

      const continuedOriginal = Array.from({ length: 20 }, () => original.next());
      const continuedRestored = Array.from({ length: 20 }, () => restored.next());
      expect(continuedRestored).toEqual(continuedOriginal);
    });

    test('should tolerate missing data', () => {
      const stream = RandomStream.fromJSON(undefined);
      expect(stream.name).toBe('unnamed');
      expect(Number.isFinite(stream.next())).toBe(true);
    });
  });
});

describe('RandomSource', () => {
  test('should return the same live stream for repeated names', () => {
    const source = new RandomSource('game-0001');
    expect(source.stream('price-noise')).toBe(source.stream('price-noise'));
  });

  test('should advance a named stream independently of others', () => {
    const source = new RandomSource('game-0001');
    const noiseFirst = source.stream('price-noise').next();

    const other = new RandomSource('game-0001');
    other.stream('investor-beliefs').next();
    other.stream('investor-beliefs').next();
    const otherNoiseFirst = other.stream('price-noise').next();

    // Draining an unrelated stream must not shift price-noise
    expect(otherNoiseFirst).toBe(noiseFirst);
  });

  test('should give different streams different sequences', () => {
    const source = new RandomSource('game-0001');
    expect(source.stream('a').next()).not.toBe(source.stream('b').next());
  });

  test('should produce identical results across sources with the same seed', () => {
    const a = new RandomSource('game-0001');
    const b = new RandomSource('game-0001');
    const seqA = Array.from({ length: 30 }, () => a.stream('price-noise').next());
    const seqB = Array.from({ length: 30 }, () => b.stream('price-noise').next());
    expect(seqA).toEqual(seqB);
  });

  test('should produce different results for different seeds', () => {
    const a = new RandomSource('game-0001');
    const b = new RandomSource('game-0002');
    expect(a.stream('price-noise').next()).not.toBe(b.stream('price-noise').next());
  });

  test('should accept a numeric seed', () => {
    const a = new RandomSource(12345);
    const b = new RandomSource(12345);
    expect(a.stream('x').next()).toBe(b.stream('x').next());
  });

  describe('serialization', () => {
    test('should resume every stream mid-sequence after a round trip', () => {
      const original = new RandomSource('game-0001');
      for (let i = 0; i < 13; i += 1) {
        original.stream('price-noise').next();
      }
      for (let i = 0; i < 5; i += 1) {
        original.stream('investor-beliefs').next();
      }

      const restored = RandomSource.fromJSON(JSON.parse(JSON.stringify(original.toJSON())));

      expect(restored.stream('price-noise').next())
        .toBe(original.stream('price-noise').next());
      expect(restored.stream('investor-beliefs').next())
        .toBe(original.stream('investor-beliefs').next());
    });

    test('should emit streams in a stable sorted order', () => {
      const source = new RandomSource('game-0001');
      source.stream('zebra').next();
      source.stream('alpha').next();
      source.stream('middle').next();

      expect(source.toJSON().streams.map(s => s.name)).toEqual(['alpha', 'middle', 'zebra']);
    });

    test('should produce byte-identical output for identical runs', () => {
      const run = () => {
        const source = new RandomSource('game-0001');
        for (let i = 0; i < 40; i += 1) {
          source.stream('price-noise').next();
          source.stream('investor-beliefs').int(1, 100);
        }
        return JSON.stringify(source.toJSON());
      };

      expect(run()).toBe(run());
    });

    test('should yield a usable source from missing data', () => {
      const source = RandomSource.fromJSON(undefined);
      expect(source.seed).toBe(0);
      expect(Number.isFinite(source.stream('anything').next())).toBe(true);
    });

    test('should not create streams that were never used', () => {
      const source = new RandomSource('game-0001');
      expect(source.toJSON().streams).toEqual([]);
    });
  });
});
