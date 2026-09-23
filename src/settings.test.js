const { defaultSettings, settingsBlock, numericReader, settingsValue } = require('./settings');

describe('settings', () => {
  describe('defaultSettings', () => {
    test('should read the shipped settings file', () => {
      expect(defaultSettings().time.ticks_per_day).toBeGreaterThan(0);
    });
  });

  describe('settingsBlock', () => {
    test('should return the shipped block when nothing is configured', () => {
      expect(settingsBlock({}, 'time')).toEqual(defaultSettings().time);
    });

    test('should let a configured key win while keeping the rest', () => {
      const time = settingsBlock({ time: { ticks_per_day: 10 } }, 'time');

      expect(time.ticks_per_day).toBe(10);
      expect(time.days_per_quarter).toBe(defaultSettings().time.days_per_quarter);
    });

    test('should return an empty object for a block that does not exist', () => {
      expect(settingsBlock({}, 'no_such_block')).toEqual({});
    });

    test('should tolerate null settings', () => {
      expect(settingsBlock(null, 'time')).toEqual(defaultSettings().time);
    });
  });

  describe('numericReader', () => {
    test('should read a configured number', () => {
      const read = numericReader({ appraisal: { base_discount_rate: 0.5 } }, 'appraisal');

      expect(read('base_discount_rate')).toBe(0.5);
    });

    test('should fall back to the shipped value when unusable', () => {
      const shipped = defaultSettings().appraisal.base_discount_rate;
      const read = numericReader({ appraisal: { base_discount_rate: 'x' } }, 'appraisal');

      expect(read('base_discount_rate')).toBe(shipped);
      expect(numericReader({}, 'appraisal')('base_discount_rate')).toBe(shipped);
    });

    test('should accept zero by default, because zero is a legal cost', () => {
      const read = numericReader({ production: { staff_wage_per_day: 0 } }, 'production');

      expect(read('staff_wage_per_day')).toBe(0);
    });

    test('should reject zero when asked to', () => {
      const shipped = defaultSettings().time.ticks_per_day;
      const read = numericReader({ time: { ticks_per_day: 0 } }, 'time', true);

      expect(read('ticks_per_day')).toBe(shipped);
    });
  });

  describe('settingsValue', () => {
    test('should return a configured top-level value', () => {
      expect(settingsValue({ loan_term_quarters: 9 }, 'loan_term_quarters')).toBe(9);
    });

    test('should fall back to the shipped value when absent', () => {
      expect(settingsValue({}, 'loan_term_quarters'))
        .toBe(defaultSettings().loan_term_quarters);
    });

    test('should keep a configured zero rather than treating it as absent', () => {
      expect(settingsValue({ loan_term_quarters: 0 }, 'loan_term_quarters')).toBe(0);
    });
  });
});
