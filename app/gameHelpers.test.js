const { calculateCargoMass, replaceMessageVariables } = require('./gameHelpers');

describe('gameHelpers', () => {
  describe('calculateCargoMass', () => {
    test('returns 0 for empty cargo', () => {
      expect(calculateCargoMass({}, {})).toBe(0);
    });

    test('calculates mass for metric ton goods', () => {
      const cargo = { iron: 5 };
      const goodsData = { iron: { finishedMass: { mass: 2, units: 'metric tons' } } };
      expect(calculateCargoMass(cargo, goodsData)).toBe(10);
    });

    test('converts kilograms to metric tons', () => {
      const cargo = { coffee: 100 };
      const goodsData = { coffee: { finishedMass: { mass: 500, units: 'kilograms' } } };
      expect(calculateCargoMass(cargo, goodsData)).toBe(50);
    });

    test('counts passengers at 10 per ton', () => {
      const cargo = { passengers: 20 };
      const goodsData = {};
      expect(calculateCargoMass(cargo, goodsData)).toBe(2);
    });

    test('skips goods not in goodsData', () => {
      const cargo = { unknownGood: 5 };
      expect(calculateCargoMass(cargo, {})).toBe(0);
    });

    test('skips goods with no finishedMass', () => {
      const cargo = { ore: 5 };
      const goodsData = { ore: { label: 'Ore', value: 100 } };
      expect(calculateCargoMass(cargo, goodsData)).toBe(0);
    });

    test('ignores goods with unsupported units', () => {
      const cargo = { exotic: 5 };
      const goodsData = { exotic: { finishedMass: { mass: 100, units: 'liters' } } };
      expect(calculateCargoMass(cargo, goodsData)).toBe(0);
    });

    test('handles mixed cargo with goods and passengers', () => {
      const cargo = { iron: 2, passengers: 30 };
      const goodsData = { iron: { finishedMass: { mass: 1, units: 'metric tons' } } };
      // 2 tons (iron) + 3 tons (30 passengers / 10) = 5
      expect(calculateCargoMass(cargo, goodsData)).toBe(5);
    });

    test('accumulates mass from multiple goods', () => {
      const cargo = { iron: 3, food: 2 };
      const goodsData = {
        iron: { finishedMass: { mass: 2, units: 'metric tons' } },
        food: { finishedMass: { mass: 500, units: 'kilograms' } }
      };
      // 6 tons (iron) + 1 ton (food) = 7
      expect(calculateCargoMass(cargo, goodsData)).toBe(7);
    });
  });

  describe('replaceMessageVariables', () => {
    test('replaces a single variable', () => {
      expect(replaceMessageVariables('Hello {name}!', { name: 'Captain' }))
        .toBe('Hello Captain!');
    });

    test('replaces multiple variables', () => {
      expect(replaceMessageVariables('{a} and {b}', { a: 'foo', b: 'bar' }))
        .toBe('foo and bar');
    });

    test('leaves unmatched tokens intact', () => {
      expect(replaceMessageVariables('System {id}', {}))
        .toBe('System {id}');
    });

    test('returns message unchanged when no tokens present', () => {
      expect(replaceMessageVariables('No tokens here', { x: 1 }))
        .toBe('No tokens here');
    });

    test('handles empty string message', () => {
      expect(replaceMessageVariables('', { x: 1 })).toBe('');
    });

    test('handles numeric replacement values', () => {
      expect(replaceMessageVariables('System {id}', { id: 42 }))
        .toBe('System 42');
    });

    test('replaces same token multiple times', () => {
      expect(replaceMessageVariables('{x} and {x}', { x: 'yes' }))
        .toBe('yes and yes');
    });

    test('does not replace partial token syntax', () => {
      expect(replaceMessageVariables('no {braces here', { braces: 'X' }))
        .toBe('no {braces here');
    });
  });
});
