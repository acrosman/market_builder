const fs = require('fs');
const path = require('path');
const { createLogger } = require('./logger');

const logger = createLogger('ContentCache');

const DEFAULT_DATA_DIRECTORY = 'data/default/en-us';

/**
 * Cache of parsed content files, keyed by absolute path.
 * Failures are cached as null so a missing file is not re-read on every call.
 * @type {Map<string, Object|null>}
 */
const contentCache = new Map();

/**
 * Cached loader for the static content files in `data/<pack>/<locale>/`.
 *
 * These files never change while the game is running, but were being re-read
 * and re-parsed from disk on every access. `calculateMarketPrice` alone
 * re-parsed the whole of `goods.json` for every price query, and the
 * `StellarObject` constructor re-read `game_settings.json` once per object, so
 * loading a 200-object universe meant 200 synchronous reads.
 *
 * That was tolerable when prices were only computed on demand for one market
 * the player was looking at. It is not tolerable once production runs every
 * tick across every stellar object and good.
 *
 * Deliberately not used for save files, which must always be read fresh, nor in
 * `universe.js`, whose name lookups re-read on purpose so tests can vary the
 * name pools between universes.
 */

/**
 * Deep-freeze an object so cached content cannot be mutated by a caller.
 *
 * Callers receive a shared reference rather than a copy, because copying on
 * every access would give back the cost this cache exists to remove. Freezing
 * makes accidental mutation a no-op instead of silent cross-caller corruption.
 * @param {*} value - Value to freeze recursively.
 * @returns {*} The same value, frozen.
 * @example
 * const frozen = deepFreeze({ a: { b: 1 } });
 */
function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  Object.values(value).forEach(entry => deepFreeze(entry));
  return value;
}

/**
 * Load and parse a content file, caching the result.
 * @param {string} fileName - File name with or without the .json extension.
 * @param {string} [dataDirectory] - Data directory relative to the repo root.
 * @returns {Object} Parsed, frozen content, or an empty object on failure.
 * @example
 * const goods = loadContent('goods', game.getDataDirectory());
 * const price = goods.metalOre.value;
 */
function loadContent(fileName, dataDirectory = DEFAULT_DATA_DIRECTORY) {
  const withExtension = fileName.endsWith('.json') ? fileName : `${fileName}.json`;
  const contentPath = path.join(__dirname, '..', dataDirectory, withExtension);

  if (contentCache.has(contentPath)) {
    return contentCache.get(contentPath) || {};
  }

  try {
    const parsed = deepFreeze(JSON.parse(fs.readFileSync(contentPath, 'utf-8')));
    contentCache.set(contentPath, parsed);
    return parsed;
  } catch (error) {
    logger.error(`Failed to load content file ${contentPath}:`, error);
    // Negative-cache so a missing file is not retried on every tick
    contentCache.set(contentPath, null);
    return {};
  }
}

/**
 * Clear the cache.
 *
 * Intended for tests that swap data directories or file contents between cases.
 * Production code has no reason to call this: content does not change while the
 * game is running.
 * @returns {void}
 * @example
 * afterEach(() => clearContentCache());
 */
function clearContentCache() {
  contentCache.clear();
}

module.exports = {
  loadContent,
  clearContentCache,
  DEFAULT_DATA_DIRECTORY
};
