const { numericReader } = require('../settings');

/**
 * Time conversions for the economy.
 *
 * The game's fundamental unit is the tick, which represents one game-hour.
 * Economic processes run on coarser cycles: interest accrues per tick but is
 * quoted as an annual rate, markets clear daily, and books close quarterly.
 * Putting the conversions in one place keeps those cycles consistent and makes
 * the pacing tunable from game_settings.json rather than from code.
 */

/**
 * Read the time configuration from settings, filling in defaults.
 * @param {Object} [settings={}] - Resolved game settings.
 * @returns {Object} Time configuration.
 * @example
 * const time = timeConfig(game.getSettings());
 */
function timeConfig(settings = {}) {
  const read = numericReader(settings, 'time', true);
  return {
    ticksPerDay: read('ticks_per_day'),
    daysPerQuarter: read('days_per_quarter'),
    quartersPerYear: read('quarters_per_year')
  };
}

/**
 * Ticks in one game day. Markets clear on this cycle.
 * @param {Object} [settings={}] - Resolved game settings.
 * @returns {number} Ticks per day.
 * @example
 * ticksPerDay(settings); // => 24
 */
function ticksPerDay(settings = {}) {
  return timeConfig(settings).ticksPerDay;
}

/**
 * Ticks in one reporting quarter. Books close on this cycle.
 *
 * This is the single most important pacing number in the investing game: it
 * sets how long price moves on expectation before it snaps toward fact. At the
 * default of 2160 ticks and roughly ten ticks per jump, that is a long stretch
 * of play between reports, so expect to tune it.
 * @param {Object} [settings={}] - Resolved game settings.
 * @returns {number} Ticks per quarter.
 * @example
 * ticksPerQuarter(settings); // => 2160
 */
function ticksPerQuarter(settings = {}) {
  const { ticksPerDay: perDay, daysPerQuarter } = timeConfig(settings);
  return perDay * daysPerQuarter;
}

/**
 * Ticks in one game year. Annual rates are divided by this to get a tick rate.
 * @param {Object} [settings={}] - Resolved game settings.
 * @returns {number} Ticks per year.
 * @example
 * ticksPerYear(settings); // => 8640
 */
function ticksPerYear(settings = {}) {
  return ticksPerQuarter(settings) * timeConfig(settings).quartersPerYear;
}

/**
 * Get the zero-based quarter index a tick falls in.
 * @param {number} tick - Absolute game tick.
 * @param {Object} [settings={}] - Resolved game settings.
 * @returns {number} Quarter index, starting at 0.
 * @example
 * quarterForTick(2160, settings); // => 1
 */
function quarterForTick(tick, settings = {}) {
  const perQuarter = ticksPerQuarter(settings);
  return Math.floor(Math.max(0, Number(tick) || 0) / perQuarter);
}

/**
 * Get the inclusive tick range of a quarter.
 * @param {number} quarterIndex - Zero-based quarter index.
 * @param {Object} [settings={}] - Resolved game settings.
 * @returns {Object} `{ fromTick, toTick }`, both inclusive.
 * @example
 * quarterTickRange(0, settings); // => { fromTick: 0, toTick: 2159 }
 */
function quarterTickRange(quarterIndex, settings = {}) {
  const perQuarter = ticksPerQuarter(settings);
  const index = Math.max(0, Math.floor(Number(quarterIndex) || 0));
  const fromTick = index * perQuarter;
  return { fromTick, toTick: (fromTick + perQuarter) - 1 };
}

/**
 * Convert an annual percentage rate into a per-tick fractional rate.
 * @param {number} annualPercent - Annual rate as a percentage, e.g. 6 for 6%.
 * @param {Object} [settings={}] - Resolved game settings.
 * @returns {number} Per-tick fractional rate.
 * @example
 * perTickRate(6, settings); // => 0.00000694...
 */
function perTickRate(annualPercent, settings = {}) {
  const annual = Number(annualPercent) || 0;
  return (annual / 100) / ticksPerYear(settings);
}

module.exports = {
  timeConfig,
  ticksPerDay,
  ticksPerQuarter,
  ticksPerYear,
  quarterForTick,
  quarterTickRange,
  perTickRate
};
