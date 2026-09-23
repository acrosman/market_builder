const {
  timeConfig,
  ticksPerDay,
  ticksPerQuarter,
  ticksPerYear,
  quarterForTick,
  quarterTickRange,
  perTickRate
} = require('./clock');

const SETTINGS = { time: { ticks_per_day: 24, days_per_quarter: 90, quarters_per_year: 4 } };

describe('clock', () => {
  describe('timeConfig', () => {
    test('should read configured values', () => {
      expect(timeConfig(SETTINGS)).toEqual({
        ticksPerDay: 24, daysPerQuarter: 90, quartersPerYear: 4
      });
    });

    test('should fall back to defaults for missing or empty settings', () => {
      expect(timeConfig()).toEqual({ ticksPerDay: 24, daysPerQuarter: 90, quartersPerYear: 4 });
      expect(timeConfig({})).toEqual({ ticksPerDay: 24, daysPerQuarter: 90, quartersPerYear: 4 });
      expect(timeConfig({ time: {} }).ticksPerDay).toBe(24);
    });

    test('should fall back for invalid values', () => {
      expect(timeConfig({ time: { ticks_per_day: 'x' } }).ticksPerDay).toBe(24);
      expect(timeConfig({ time: { ticks_per_day: 0 } }).ticksPerDay).toBe(24);
    });
  });

  describe('derived cycles', () => {
    test('should derive day, quarter, and year', () => {
      expect(ticksPerDay(SETTINGS)).toBe(24);
      expect(ticksPerQuarter(SETTINGS)).toBe(2160);
      expect(ticksPerYear(SETTINGS)).toBe(8640);
    });

    test('should honour a retuned quarter length', () => {
      const faster = { time: { ticks_per_day: 24, days_per_quarter: 30, quarters_per_year: 4 } };
      expect(ticksPerQuarter(faster)).toBe(720);
      expect(ticksPerYear(faster)).toBe(2880);
    });
  });

  describe('quarterForTick', () => {
    test('should map ticks to quarters', () => {
      expect(quarterForTick(0, SETTINGS)).toBe(0);
      expect(quarterForTick(2159, SETTINGS)).toBe(0);
      expect(quarterForTick(2160, SETTINGS)).toBe(1);
      expect(quarterForTick(4320, SETTINGS)).toBe(2);
    });

    test('should clamp negatives and invalid input to quarter zero', () => {
      expect(quarterForTick(-5, SETTINGS)).toBe(0);
      expect(quarterForTick(NaN, SETTINGS)).toBe(0);
    });
  });

  describe('quarterTickRange', () => {
    test('should give inclusive bounds that tile without gaps or overlap', () => {
      expect(quarterTickRange(0, SETTINGS)).toEqual({ fromTick: 0, toTick: 2159 });
      expect(quarterTickRange(1, SETTINGS)).toEqual({ fromTick: 2160, toTick: 4319 });
    });

    test('should round trip with quarterForTick', () => {
      [0, 1, 5, 17].forEach(index => {
        const { fromTick, toTick } = quarterTickRange(index, SETTINGS);
        expect(quarterForTick(fromTick, SETTINGS)).toBe(index);
        expect(quarterForTick(toTick, SETTINGS)).toBe(index);
      });
    });

    test('should clamp invalid indices', () => {
      expect(quarterTickRange(-3, SETTINGS)).toEqual({ fromTick: 0, toTick: 2159 });
    });
  });

  describe('perTickRate', () => {
    test('should convert an annual percentage to a per-tick fraction', () => {
      expect(perTickRate(100, SETTINGS)).toBeCloseTo(1 / 8640, 12);
      expect(perTickRate(6, SETTINGS)).toBeCloseTo(0.06 / 8640, 12);
    });

    test('should return zero for invalid rates', () => {
      expect(perTickRate(0, SETTINGS)).toBe(0);
      expect(perTickRate(NaN, SETTINGS)).toBe(0);
    });
  });
});
