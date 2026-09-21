/** Schema version for the serialized news store. */
const NEWS_SCHEMA_VERSION = 1;

/** How many items to retain. */
const DEFAULT_NEWS_LENGTH = 256;

/**
 * Things worth knowing about, in the order they happened.
 *
 * The economy already emits events, but they vanish the moment they fire. A
 * player who was three jumps away when a company collapsed has no way to learn
 * it happened, and a market that moves for reasons nobody can see is just noise.
 * This keeps a bounded record of what occurred so it can be read afterwards.
 *
 * **Every item carries the system it happened in.** Nothing uses that yet:
 * knowledge is global and instant. It is recorded from the start because making
 * news travel at ship speed later -- so a distant collapse is an opportunity for
 * whoever hears first -- is a change to how items are *read*, and only possible
 * if the origin was captured when they were written. Adding the field
 * retroactively would mean every item already in a save had nowhere to have
 * come from.
 */

/** Categories of news, used for filtering and for choosing how to present it. */
const NEWS_KINDS = {
  STATEMENT_PUBLISHED: 'statement_published',
  DIVIDEND_PAID: 'dividend_paid',
  FORCED_LOAN: 'forced_loan',
  MATURITY_APPROACHING: 'maturity_approaching',
  BANKRUPTCY: 'bankruptcy',
  CONTROL_CHANGED: 'control_changed',
  LISTING_OPENED: 'listing_opened',
  DISTRESS: 'distress'
};

/** How much a reader should care. */
const SEVERITY = {
  ROUTINE: 'routine',
  NOTABLE: 'notable',
  CRITICAL: 'critical'
};

/**
 * A bounded, ordered record of economic events.
 */
class NewsStore {
  /**
   * Create an empty store.
   * @param {number} [capacity] - How many items to retain.
   * @example
   * const news = new NewsStore();
   */
  constructor(capacity = DEFAULT_NEWS_LENGTH) {
    /** @type {Array<Object>} Items oldest first. */
    this.items = [];
    this.capacity = Math.max(1, Math.round(Number(capacity) || DEFAULT_NEWS_LENGTH));
    this.nextId = 1;
  }

  /**
   * Record an item.
   * @param {Object} item - The event.
   * @param {number} item.tick - When it happened.
   * @param {string} item.kind - One of NEWS_KINDS.
   * @param {number|null} [item.originSystemId] - Where it happened, when that is known.
   * @param {string} [item.severity] - One of SEVERITY.
   * @param {Object} [item.tokens] - Values for the message that presents it.
   * @returns {Object} The recorded item.
   * @example
   * news.record({ tick, kind: NEWS_KINDS.BANKRUPTCY, tokens: { companyName } });
   */
  record(item) {
    const recorded = {
      id: this.nextId,
      tick: Math.max(0, Math.round(Number(item?.tick) || 0)),
      kind: item?.kind || 'unspecified',
      // Null rather than omitted: an event with no place is different from one
      // whose place was never captured, and only the first is legitimate.
      originSystemId: item?.originSystemId ?? null,
      severity: item?.severity || SEVERITY.ROUTINE,
      tokens: item?.tokens ? { ...item.tokens } : {}
    };

    this.nextId += 1;
    this.items.push(recorded);

    if (this.items.length > this.capacity) {
      this.items.splice(0, this.items.length - this.capacity);
    }

    return recorded;
  }

  /**
   * Read recent items, newest first.
   * @param {Object} [options={}] - `{ limit, kind, sinceTick }`.
   * @returns {Array<Object>} Matching items, newest first.
   * @example
   * news.recent({ limit: 20, kind: NEWS_KINDS.BANKRUPTCY });
   */
  recent({ limit = 50, kind = null, sinceTick = null } = {}) {
    return this.items
      .filter(item => (kind ? item.kind === kind : true))
      .filter(item => (sinceTick === null ? true : item.tick >= sinceTick))
      .slice(-Math.max(1, limit))
      .reverse();
  }

  /**
   * Serialize for saving.
   * @returns {Object} Plain serializable object.
   * @example
   * const block = news.toJSON();
   */
  toJSON() {
    return {
      schemaVersion: NEWS_SCHEMA_VERSION,
      capacity: this.capacity,
      nextId: this.nextId,
      items: this.items
    };
  }

  /**
   * Rebuild from saved data.
   * @param {Object} [data] - Serialized store.
   * @returns {NewsStore} Restored store.
   * @example
   * const news = NewsStore.fromJSON(saveData.economy.news);
   */
  static fromJSON(data) {
    const store = new NewsStore(data?.capacity);
    store.items = Array.isArray(data?.items) ? data.items : [];

    const savedNextId = Number(data?.nextId);
    const maxId = store.items.reduce(
      (highest, item) => Math.max(highest, Number(item.id) || 0),
      0
    );
    store.nextId = Number.isFinite(savedNextId) && savedNextId > maxId
      ? savedNextId
      : maxId + 1;

    return store;
  }
}

/**
 * Find the system a corporation is most associated with.
 *
 * Used as the origin for company news. A corporation is not in one place, so
 * this takes its first holding, which is the best available answer and enough
 * for news to have somewhere to have come from.
 * @param {Object} game - The game.
 * @param {Object} corporation - The corporation.
 * @returns {number|null} A system id, or null when it holds nothing.
 * @example
 * const origin = corporationOriginSystem(game, corporation);
 */
function corporationOriginSystem(game, corporation) {
  const objectIds = Array.isArray(corporation?.stellarObjects)
    ? corporation.stellarObjects
    : [];

  for (const objectId of objectIds) {
    const stellarObject = game.findStellarObject(objectId);
    if (stellarObject) {
      return stellarObject.location ?? null;
    }
  }

  return null;
}

module.exports = {
  NEWS_SCHEMA_VERSION,
  DEFAULT_NEWS_LENGTH,
  NEWS_KINDS,
  SEVERITY,
  NewsStore,
  corporationOriginSystem
};
