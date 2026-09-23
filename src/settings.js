const { loadContent } = require('./contentCache');

/**
 * Resolved access to game settings, with the shipped defaults as the fallback.
 *
 * `data/default/en-us/game_settings.json` is the one place a default value is
 * written down. Modules read their block through `settingsBlock()` rather than
 * keeping a local copy, so there is no second definition to drift out of step
 * with the file the game actually ships.
 */

/**
 * Read the shipped default settings.
 *
 * Cached and deep-frozen by `contentCache`, so this is cheap to call per read.
 * @returns {Object} The shipped settings, or an empty object if unreadable.
 * @example
 * const shipped = defaultSettings();
 */
function defaultSettings() {
  return loadContent('game_settings.json') || {};
}

/**
 * Read one settings block, filling any missing key from the shipped defaults.
 *
 * Callers pass whatever settings the game was built with. A block the caller
 * omitted, or an individual key inside it, falls back to the shipped value, so
 * a partial settings object in a test behaves the same as a full one in play.
 * @param {Object} [settings={}] - Resolved game settings.
 * @param {string} blockName - Top-level key, e.g. 'time' or 'production'.
 * @returns {Object} The merged block.
 * @example
 * const time = settingsBlock(game.getSettings(), 'time');
 * // => { ticks_per_day: 24, days_per_quarter: 90, quarters_per_year: 4 }
 */
function settingsBlock(settings = {}, blockName) {
  return { ...(defaultSettings()[blockName] || {}), ...(settings?.[blockName] || {}) };
}

/**
 * Build a numeric reader for one settings block.
 *
 * Returns a function that reads a key as a number and falls back to the shipped
 * default when the configured value is missing or unusable. Zero is a legal
 * value for most economy settings, so the fallback triggers on a non-finite
 * result rather than on a falsy one; pass `rejectZero` for the settings where
 * zero would be nonsense, such as ticks per day.
 * @param {Object} [settings={}] - Resolved game settings.
 * @param {string} blockName - Top-level key, e.g. 'appraisal'.
 * @param {boolean} [rejectZero=false] - Treat zero as unusable.
 * @returns {Function} `(key) => number`.
 * @example
 * const read = numericReader(settings, 'appraisal');
 * read('base_discount_rate'); // => 0.12
 */
function numericReader(settings = {}, blockName, rejectZero = false) {
  const configured = settings?.[blockName] || {};
  const shipped = defaultSettings()[blockName] || {};

  return (key) => {
    const value = Number(configured[key]);
    const usable = Number.isFinite(value) && (!rejectZero || value !== 0);
    return usable ? value : Number(shipped[key]);
  };
}

/**
 * Read one top-level scalar setting, falling back to the shipped value.
 * @param {Object} [settings={}] - Resolved game settings.
 * @param {string} name - Top-level key, e.g. 'loan_term_quarters'.
 * @returns {*} The configured value, or the shipped default.
 * @example
 * settingsValue(game.getSettings(), 'loan_term_quarters'); // => 4
 */
function settingsValue(settings = {}, name) {
  const configured = settings?.[name];
  return configured === undefined ? defaultSettings()[name] : configured;
}

module.exports = {
  defaultSettings,
  settingsBlock,
  numericReader,
  settingsValue
};
