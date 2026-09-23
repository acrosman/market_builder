const {
  INSTRUMENT_KINDS,
  equityInstrument,
  symbolFor,
  describeInstrument,
  settlesByShareTransfer
} = require('./instruments');
const { Listing } = require('./listing');
const { Exchange } = require('./exchange');

describe('instruments', () => {
  test('should describe an equity', () => {
    const instrument = equityInstrument('Acme Orbital');
    expect(instrument.kind).toBe(INSTRUMENT_KINDS.EQUITY);
    expect(describeInstrument(instrument))
      .toEqual({ kind: 'equity', corporationName: 'Acme Orbital' });
  });

  test('should key an equity by its company name', () => {
    // Existing callers look listings up by company, so the symbol must match
    expect(symbolFor(equityInstrument('Acme Orbital'))).toBe('Acme Orbital');
  });

  test('should refuse to key an unusable descriptor', () => {
    expect(symbolFor(null)).toBeNull();
    expect(symbolFor({ kind: 'not-a-thing' })).toBeNull();
    expect(symbolFor(equityInstrument(''))).toBeNull();
  });

  test('should route only equity through share settlement', () => {
    expect(settlesByShareTransfer(equityInstrument('Acme'))).toBe(true);
    // A future would settle as a dated obligation, not a share transfer, so it
    // gets its own branch rather than falling through this one
    expect(settlesByShareTransfer({ kind: 'futures' })).toBe(false);
    expect(settlesByShareTransfer(null)).toBe(false);
  });

  test('should describe an unknown descriptor without throwing', () => {
    expect(describeInstrument(undefined)).toEqual({ kind: null, corporationName: null });
  });
});

describe('listings carry an instrument', () => {
  test('should build an equity instrument from a company name', () => {
    const listing = new Listing({ corporationName: 'Meridian', referencePrice: 50 });

    expect(listing.instrument.kind).toBe(INSTRUMENT_KINDS.EQUITY);
    expect(listing.symbol).toBe('Meridian');
    expect(listing.corporationName).toBe('Meridian');
  });

  test('should accept an instrument directly', () => {
    const listing = new Listing({ instrument: equityInstrument('Meridian') });
    expect(listing.symbol).toBe('Meridian');
  });

  test('should round trip the instrument', () => {
    const listing = new Listing({ corporationName: 'Meridian', referencePrice: 50 });
    const restored = Listing.fromJSON(JSON.parse(JSON.stringify(listing.toJSON())));

    expect(restored.instrument).toEqual(listing.instrument);
    expect(restored.symbol).toBe('Meridian');
  });

  test('should reconstruct an instrument for a save written before they existed', () => {
    const restored = Listing.fromJSON({
      corporationName: 'Meridian', lastPrice: 50, orders: [], history: []
    });

    expect(restored.instrument.kind).toBe(INSTRUMENT_KINDS.EQUITY);
    expect(restored.symbol).toBe('Meridian');
  });
});

describe('the exchange lists instruments generically', () => {
  test('should list through the generic entry point', () => {
    const exchange = new Exchange();
    const listing = exchange.listInstrument({
      instrument: equityInstrument('Meridian'), referencePrice: 50
    });

    expect(listing).not.toBeNull();
    expect(exchange.getListing('Meridian')).toBe(listing);
  });

  test('should treat listCompany as equity shorthand over it', () => {
    const exchange = new Exchange();
    const viaShorthand = exchange.listCompany({
      corporationName: 'Meridian', referencePrice: 50
    });

    expect(viaShorthand.instrument.kind).toBe(INSTRUMENT_KINDS.EQUITY);
    expect(exchange.listInstrument({ instrument: equityInstrument('Meridian') }))
      .toBe(viaShorthand);
  });

  test('should refuse an instrument it cannot key', () => {
    expect(new Exchange().listInstrument({ instrument: { kind: 'futures' } })).toBeNull();
  });

  test('should report both the symbol and the issuer when a listing clears', () => {
    const { EconomyState } = require('../economy/economyState');
    const { recordOpeningBalance } = require('../economy/transactions');
    const { playerHolder } = require('../economy/accounts');
    const { SIDES } = require('./auction');

    const economy = new EconomyState({ seed: 'instrument' });
    const exchange = economy.getExchange();
    exchange.listCompany({
      corporationName: 'Meridian', referencePrice: 50, sharesOutstanding: 100
    });

    const alice = playerHolder('Alice');
    const bob = playerHolder('Bob');
    recordOpeningBalance(economy, { tick: 0, holder: alice, amount: 100000 });
    exchange.portfolio.adjust(bob, 'Meridian', 100);

    exchange.submitOrder({
      corporationName: 'Meridian', holder: bob, side: SIDES.SELL, quantity: 100, limitPrice: 50
    });
    exchange.submitOrder({
      corporationName: 'Meridian', holder: alice, side: SIDES.BUY, quantity: 100, limitPrice: 50
    });

    const [result] = exchange.clearAll({ economy, tick: 24 });
    expect(result.symbol).toBe('Meridian');
    expect(result.corporationName).toBe('Meridian');
  });
});
