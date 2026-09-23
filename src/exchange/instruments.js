/**
 * What can be listed and traded on the exchange.
 *
 * Only equity exists today. The abstraction is here so commodity instruments --
 * futures contracts on goods, most likely -- can be listed alongside shares
 * without reworking the book, the auction or the holdings register.
 *
 * The parts that genuinely do not care what they are trading stay generic: the
 * auction matches orders by price and quantity, the listing holds a book and a
 * price history, and the portfolio records signed positions by symbol. Only
 * settlement needs to know what an instrument is, because that is where a
 * position turns into something real -- shares changing hands for equity, and
 * for a future, a dated obligation to deliver or take delivery of goods.
 *
 * Deliberately not built yet: expiry, delivery, margin, and mark-to-market.
 * A futures market without those is a way to take unlimited risk for free.
 */

/** Instrument kinds. Extend here when a new tradeable is added. */
const INSTRUMENT_KINDS = {
  /** A share in a corporation. Settles by transferring shares. */
  EQUITY: 'equity'
};

/**
 * Build an equity instrument descriptor.
 * @param {string} corporationName - The listed company.
 * @returns {Object} Instrument descriptor.
 * @example
 * equityInstrument('Acme Orbital');
 */
function equityInstrument(corporationName) {
  return { kind: INSTRUMENT_KINDS.EQUITY, corporationName };
}

/**
 * Derive the symbol a listing is keyed by.
 *
 * For equity the symbol is the company name, so existing callers that look a
 * listing up by company keep working. A future would key by something like
 * `metalOre@2026Q3`, which is why this is a function rather than an assumption
 * spread through the exchange.
 * @param {Object} instrument - Instrument descriptor.
 * @returns {string|null} The symbol, or null when the descriptor is unusable.
 * @example
 * symbolFor(equityInstrument('Acme Orbital')); // => 'Acme Orbital'
 */
function symbolFor(instrument) {
  if (instrument?.kind === INSTRUMENT_KINDS.EQUITY) {
    return instrument.corporationName || null;
  }
  return null;
}

/**
 * Get a human-facing description of what is being traded.
 * @param {Object} instrument - Instrument descriptor.
 * @returns {Object} `{ kind, corporationName }` for display and message tokens.
 * @example
 * describeInstrument(equityInstrument('Acme Orbital'));
 */
function describeInstrument(instrument) {
  return {
    kind: instrument?.kind || null,
    corporationName: instrument?.corporationName || null
  };
}

/**
 * Whether an instrument settles by moving shares between holders.
 *
 * Settlement branches on this rather than assuming equity, so adding a
 * differently settled instrument is a new branch rather than an edit to the
 * existing path.
 * @param {Object} instrument - Instrument descriptor.
 * @returns {boolean} True for equity.
 * @example
 * settlesByShareTransfer(equityInstrument('Acme')); // => true
 */
function settlesByShareTransfer(instrument) {
  return instrument?.kind === INSTRUMENT_KINDS.EQUITY;
}

module.exports = {
  INSTRUMENT_KINDS,
  equityInstrument,
  symbolFor,
  describeInstrument,
  settlesByShareTransfer
};
