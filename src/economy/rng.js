/**
 * Deterministic, serializable pseudo-random number generation for economy and
 * exchange simulation.
 *
 * The game's universe generation uses unseeded `Math.random()` and is not
 * reproducible. That is a separate problem: the economy does not need universe
 * generation to be deterministic, it needs its own streams to survive a
 * save/load round trip and replay identically. This module provides that and
 * should be used by all new economy, exchange, and agent code.
 *
 * Streams are named and independent. A stream's seed is derived by hashing its
 * name together with the master seed, so adding a new stream never shifts the
 * output of an existing one. That property matters: without it, introducing a
 * new subsystem would silently change every existing subsystem's sequence and
 * break save compatibility.
 */

/** Mulberry32 increment constant. */
const MULBERRY_INCREMENT = 0x6d2b79f5;

/** 2^32, used to normalize a 32-bit unsigned integer into [0, 1). */
const UINT32_RANGE = 4294967296;

/** FNV-1a 32-bit offset basis. */
const FNV_OFFSET_BASIS = 2166136261;

/** FNV-1a 32-bit prime. */
const FNV_PRIME = 16777619;

/**
 * Hash a string to a 32-bit unsigned integer using FNV-1a.
 * Used to derive independent stream seeds from stream names.
 * @param {string} value - String to hash.
 * @returns {number} Unsigned 32-bit hash.
 * @example
 * const hash = hashString('price-noise'); // => stable 32-bit integer
 */
function hashString(value) {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

/**
 * Normalize an arbitrary value into a usable 32-bit seed.
 * Strings are hashed; finite numbers are truncated; anything else becomes 0.
 * @param {number|string} seed - Raw seed value.
 * @returns {number} Unsigned 32-bit seed.
 * @example
 * normalizeSeed('alpha-run'); // => 32-bit integer
 * normalizeSeed(12345);       // => 12345
 */
function normalizeSeed(seed) {
  if (typeof seed === 'string') {
    return hashString(seed);
  }
  const numericSeed = Number(seed);
  if (!Number.isFinite(numericSeed)) {
    return 0;
  }
  return Math.abs(Math.trunc(numericSeed)) >>> 0;
}

/**
 * A single named random stream.
 *
 * Implements Mulberry32, which holds its entire state in one 32-bit integer.
 * That is what makes mid-stream serialization exact rather than approximate:
 * restoring `state` resumes the identical sequence.
 */
class RandomStream {
  /**
   * Create a random stream.
   * @param {string} name - Stream name, used for diagnostics and seed derivation.
   * @param {number} state - Current 32-bit generator state.
   * @example
   * const stream = new RandomStream('price-noise', 12345);
   */
  constructor(name, state) {
    this.name = name;
    this.state = state >>> 0;
  }

  /**
   * Draw the next float in [0, 1).
   * @returns {number} Pseudo-random float in [0, 1).
   * @example
   * const roll = stream.next(); // => 0.7382...
   */
  next() {
    this.state = (this.state + MULBERRY_INCREMENT) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE;
  }

  /**
   * Draw a float in [min, max).
   * @param {number} min - Lower bound, inclusive.
   * @param {number} max - Upper bound, exclusive.
   * @returns {number} Pseudo-random float in [min, max).
   * @example
   * const factor = stream.float(0.7, 1.3);
   */
  float(min, max) {
    return min + (this.next() * (max - min));
  }

  /**
   * Draw an integer in [min, max], inclusive at both ends.
   * @param {number} min - Lower bound, inclusive.
   * @param {number} max - Upper bound, inclusive.
   * @returns {number} Pseudo-random integer in [min, max].
   * @example
   * const jumpCost = stream.int(1, 20);
   */
  int(min, max) {
    const low = Math.ceil(min);
    const high = Math.floor(max);
    if (high <= low) {
      return low;
    }
    return low + Math.floor(this.next() * ((high - low) + 1));
  }

  /**
   * Pick one element from an array.
   * @param {Array} items - Items to choose from.
   * @returns {*} A pseudo-randomly chosen element, or undefined when empty.
   * @example
   * const good = stream.pick(['metal', 'food', 'chemicals']);
   */
  pick(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return undefined;
    }
    return items[this.int(0, items.length - 1)];
  }

  /**
   * Return a shuffled copy of an array using Fisher-Yates.
   * Does not mutate the input.
   * @param {Array} items - Items to shuffle.
   * @returns {Array} A new, shuffled array.
   * @example
   * const order = stream.shuffle([1, 2, 3, 4]);
   */
  shuffle(items) {
    if (!Array.isArray(items)) {
      return [];
    }
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = this.int(0, i);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Draw from a normal distribution via the Box-Muller transform.
   *
   * The second Box-Muller value is discarded rather than cached, so the stream
   * carries no state beyond `this.state` and serialization stays exact.
   * @param {number} [mean=0] - Distribution mean.
   * @param {number} [stdDev=1] - Standard deviation.
   * @returns {number} A normally distributed sample.
   * @example
   * const shock = stream.normal(0, 0.02); // price noise term
   */
  normal(mean = 0, stdDev = 1) {
    // Guard against log(0), which would return -Infinity.
    let u1 = this.next();
    while (u1 === 0) {
      u1 = this.next();
    }
    const u2 = this.next();
    const magnitude = Math.sqrt(-2 * Math.log(u1));
    return mean + (stdDev * magnitude * Math.cos(2 * Math.PI * u2));
  }

  /**
   * Serialize this stream, including its exact mid-sequence position.
   * @returns {Object} Plain serializable object.
   * @example
   * const saved = stream.toJSON(); // => { name: 'price-noise', state: 918273 }
   */
  toJSON() {
    return { name: this.name, state: this.state };
  }

  /**
   * Rebuild a stream from serialized data.
   * @param {Object} data - Serialized stream from toJSON().
   * @returns {RandomStream} Restored stream that resumes the identical sequence.
   * @example
   * const stream = RandomStream.fromJSON(saved);
   */
  static fromJSON(data) {
    return new RandomStream(data?.name || 'unnamed', normalizeSeed(data?.state));
  }
}

/**
 * Owns a master seed and a set of independent named streams.
 *
 * One RandomSource belongs to a game. Each subsystem asks for its own stream by
 * name, so the order in which subsystems happen to run does not entangle their
 * sequences.
 */
class RandomSource {
  /**
   * Create a random source.
   * @param {number|string} [seed=0] - Master seed for the whole economy.
   * @example
   * const random = new RandomSource('game-0001');
   */
  constructor(seed = 0) {
    this.seed = normalizeSeed(seed);
    this.streams = new Map();
  }

  /**
   * Get (creating on first use) a named stream.
   * Repeated calls with the same name return the same live stream.
   * @param {string} name - Stream name, e.g. 'price-noise' or 'investor-beliefs'.
   * @returns {RandomStream} The named stream.
   * @example
   * const noise = random.stream('price-noise');
   */
  stream(name) {
    const streamName = String(name);
    if (!this.streams.has(streamName)) {
      // Derive from both the master seed and the name so that adding a new
      // stream cannot perturb any existing stream's sequence.
      const derivedSeed = (this.seed ^ hashString(streamName)) >>> 0;
      this.streams.set(streamName, new RandomStream(streamName, derivedSeed));
    }
    return this.streams.get(streamName);
  }

  /**
   * Serialize the master seed and every live stream's exact position.
   * @returns {Object} Plain serializable object.
   * @example
   * const saved = random.toJSON();
   */
  toJSON() {
    return {
      seed: this.seed,
      // Sorted for stable output, so save files diff cleanly and byte-identical
      // comparison works as a determinism assertion.
      streams: [...this.streams.values()]
        .map(stream => stream.toJSON())
        .sort((a, b) => a.name.localeCompare(b.name))
    };
  }

  /**
   * Rebuild a random source from serialized data.
   * Unknown or missing data yields a fresh source rather than throwing, so old
   * saves without an economy block still load.
   * @param {Object} data - Serialized source from toJSON().
   * @returns {RandomSource} Restored source.
   * @example
   * const random = RandomSource.fromJSON(saveData.economy.random);
   */
  static fromJSON(data) {
    const source = new RandomSource(data?.seed ?? 0);
    if (Array.isArray(data?.streams)) {
      data.streams.forEach(streamData => {
        const stream = RandomStream.fromJSON(streamData);
        source.streams.set(stream.name, stream);
      });
    }
    return source;
  }
}

module.exports = {
  RandomSource,
  RandomStream,
  hashString,
  normalizeSeed
};
