const fs = require('fs');
const path = require('path');
const { Game } = require('../game');
const { createUniverse } = require('../universe');
const {
  registerExchangeHandlers, resolveHolder, buildListingView
} = require('./exchangeHandlers');
const { playerHolder, corporationHolder, INVESTOR_POOL_HOLDER } = require('../economy/accounts');
const { SIDES } = require('../exchange/auction');

const settings = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'data/default/en-us/game_settings.json'), 'utf-8')
);

/**
 * Capture handlers registered against a fake ipcMain.
 * @param {Function} getCurrentGame - Returns the active game.
 * @returns {Object} Map of channel to handler.
 */
function register(getCurrentGame) {
  const handlers = {};
  const ipcMain = { handle: (channel, handler) => { handlers[channel] = handler; } };
  registerExchangeHandlers({ ipcMain, getCurrentGame });
  return handlers;
}

/**
 * Build a started game with a listed, producing corporation.
 * @param {Object} [options={}] - `{ list }` to float the company.
 * @returns {Object} `{ game, ipo }`.
 */
function listedGame({ list = true } = {}) {
  const game = new Game(createUniverse(6, 8, 12), settings, { seed: 'ipc' });
  game.initializeGame({
    name: 'Trader',
    pronouns: { subject: 'they', object: 'them', possessive: 'their', reflexive: 'themself' },
    description: 'Exchange IPC test player',
    corporation: { name: 'Meridian', description: 'A listed corporation' }
  });

  const corporation = game.getPlayer().corporation;
  const object = game.getUniverse().stellarObjects.find(
    candidate => corporation.stellarObjects.includes(candidate.id)
  );
  if (object) {
    object.buildings = { Farm: { count: 1 } };
  }

  const ipo = list ? game.listCorporation('Meridian', 10000) : null;
  return { game, ipo };
}

describe('resolveHolder', () => {
  test('should default to the player, spending their own credits', () => {
    const { game } = listedGame();
    expect(resolveHolder(game, {})).toEqual(playerHolder(game.getPlayer()));
  });

  test('should resolve a named corporation', () => {
    const { game } = listedGame();
    expect(resolveHolder(game, { asCorporation: 'Meridian' }))
      .toEqual(corporationHolder(game.getPlayer().corporation));
  });

  test('should refuse an unknown corporation rather than falling back', () => {
    const { game } = listedGame();
    // Falling back to the player would spend the wrong account's money
    expect(resolveHolder(game, { asCorporation: 'Nobody' })).toBeNull();
  });
});

describe('buildListingView', () => {
  test('should summarize a listing for display', () => {
    const { game, ipo } = listedGame();
    const listing = game.getEconomy().getExchange().getListing('Meridian');
    const view = buildListingView(game, listing);

    expect(view.symbol).toBe('Meridian');
    expect(view.instrumentKind).toBe('equity');
    expect(view.lastPrice).toBe(ipo.pricePerShare);
    expect(view.sharesOutstanding).toBe(10000);
    expect(view.isBankrupt).toBe(false);
  });

  test('should flag a bankrupt issuer', () => {
    const { game } = listedGame();
    game.getPlayer().corporation.isBankrupt = true;

    const listing = game.getEconomy().getExchange().getListing('Meridian');
    expect(buildListingView(game, listing).isBankrupt).toBe(true);
  });
});

describe('exchange IPC handlers', () => {
  describe('without a game', () => {
    test('should fail every channel gracefully', () => {
      const handlers = register(() => null);

      expect(handlers['get-exchange-listings']()).toEqual({ success: false, listings: [] });
      expect(handlers['get-exchange-listing']({}, { symbol: 'X' }).success).toBe(false);
      expect(handlers['get-exchange-portfolio']({}, {}).success).toBe(false);
      expect(handlers['submit-share-order']({}, {}).reason).toBe('no_game');
      expect(handlers['cancel-share-order']({}, {})).toEqual({ success: false });
      expect(handlers['list-corporation']({}, {}).reason).toBe('no_game');
      expect(handlers['get-cap-table']({}, { symbol: 'X' }).success).toBe(false);
    });
  });

  describe('get-exchange-listings', () => {
    test('should return every listing sorted by symbol', () => {
      const { game } = listedGame();
      game.getEconomy().getExchange().listCompany({
        corporationName: 'Aardvark Freight', referencePrice: 10
      });

      const result = register(() => game)['get-exchange-listings']();

      expect(result.success).toBe(true);
      expect(result.listings.map(listing => listing.symbol))
        .toEqual(['Aardvark Freight', 'Meridian']);
    });

    test('should be empty before anything is listed', () => {
      const { game } = listedGame({ list: false });
      expect(register(() => game)['get-exchange-listings']().listings).toEqual([]);
    });
  });

  describe('get-exchange-listing', () => {
    test('should return one listing with its book and history', () => {
      const { game } = listedGame();
      const result = register(() => game)['get-exchange-listing']({}, { symbol: 'Meridian' });

      expect(result.success).toBe(true);
      expect(result.listing.depth).toBeDefined();
      expect(Array.isArray(result.listing.history)).toBe(true);
    });

    test('should fail for an unknown symbol', () => {
      const { game } = listedGame();
      expect(register(() => game)['get-exchange-listing']({}, { symbol: 'Nobody' }).success)
        .toBe(false);
    });
  });

  describe('get-exchange-portfolio', () => {
    test('should report positions, orders and spendable credits', () => {
      const { game, ipo } = listedGame();
      const handlers = register(() => game);
      const exchange = game.getEconomy().getExchange();

      exchange.portfolio.adjust(playerHolder(game.getPlayer()), 'Meridian', 250);
      handlers['submit-share-order']({}, {
        symbol: 'Meridian', side: SIDES.BUY, quantity: 10, limitPrice: ipo.pricePerShare
      });

      const result = handlers['get-exchange-portfolio']({}, {});

      expect(result.positions).toEqual([{
        symbol: 'Meridian', shares: 250,
        lastPrice: ipo.pricePerShare, value: ipo.pricePerShare * 250
      }]);
      expect(result.orders).toHaveLength(1);
      expect(result.credits).toBe(game.getPlayer().credits);
    });

    test('should report the corporation treasury when acting as one', () => {
      const { game } = listedGame();
      const result = register(() => game)['get-exchange-portfolio']({}, {
        asCorporation: 'Meridian'
      });

      expect(result.credits)
        .toBe(Math.round(game.getPlayer().corporation.getTotalCashReserves()));
    });

    test('should fail for an unknown corporation', () => {
      const { game } = listedGame();
      expect(register(() => game)['get-exchange-portfolio']({}, { asCorporation: 'Nobody' })
        .success).toBe(false);
    });
  });

  describe('submit-share-order', () => {
    test('should accept a limit buy', () => {
      const { game, ipo } = listedGame();
      const result = register(() => game)['submit-share-order']({}, {
        symbol: 'Meridian', side: SIDES.BUY, quantity: 100, limitPrice: ipo.pricePerShare
      });

      expect(result.success).toBe(true);
      expect(result.orderId).toBe(1);
    });

    test('should accept a market order with no limit', () => {
      const { game } = listedGame();
      expect(register(() => game)['submit-share-order']({}, {
        symbol: 'Meridian', side: SIDES.BUY, quantity: 10, limitPrice: null
      }).success).toBe(true);
    });

    test('should refuse a short sale', () => {
      const { game } = listedGame();
      const result = register(() => game)['submit-share-order']({}, {
        symbol: 'Meridian', side: SIDES.SELL, quantity: 10
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe('insufficient_shares');
    });

    test('should refuse an unknown listing or malformed order', () => {
      const { game } = listedGame();
      const handlers = register(() => game);

      expect(handlers['submit-share-order']({}, {
        symbol: 'Nobody', side: SIDES.BUY, quantity: 10
      }).reason).toBe('unknown_listing');
      expect(handlers['submit-share-order']({}, {
        symbol: 'Meridian', side: SIDES.BUY, quantity: 0
      }).reason).toBe('invalid_order');
    });
  });

  describe('cancel-share-order', () => {
    test('should withdraw a resting order', () => {
      const { game, ipo } = listedGame();
      const handlers = register(() => game);

      const { orderId } = handlers['submit-share-order']({}, {
        symbol: 'Meridian', side: SIDES.BUY, quantity: 10, limitPrice: ipo.pricePerShare
      });

      expect(handlers['cancel-share-order']({}, { symbol: 'Meridian', orderId })).toEqual({
        success: true
      });
      expect(handlers['get-exchange-portfolio']({}, {}).orders).toEqual([]);
    });

    test('should not cancel an order belonging to another holder', () => {
      const { game, ipo } = listedGame();
      const handlers = register(() => game);

      const { order } = game.getEconomy().getExchange().submitOrder({
        corporationName: 'Meridian', holder: INVESTOR_POOL_HOLDER,
        side: SIDES.BUY, quantity: 10, limitPrice: ipo.pricePerShare
      });

      expect(handlers['cancel-share-order']({}, {
        symbol: 'Meridian', orderId: order.id
      }).success).toBe(false);
    });
  });

  describe('list-corporation', () => {
    test('should float a company and report the proceeds', () => {
      const { game } = listedGame({ list: false });
      const result = register(() => game)['list-corporation']({}, {
        companyName: 'Meridian', shares: 5000
      });

      expect(result.success).toBe(true);
      expect(result.pricePerShare).toBeGreaterThan(0);
      expect(result.proceeds).toBe(result.pricePerShare * 5000);
    });

    test('should refuse an unknown company', () => {
      const { game } = listedGame({ list: false });
      expect(register(() => game)['list-corporation']({}, {
        companyName: 'Nobody', shares: 100
      }).success).toBe(false);
    });
  });

  describe('get-cap-table', () => {
    test('should report holders with their ownership fraction', () => {
      const { game } = listedGame();
      const result = register(() => game)['get-cap-table']({}, { symbol: 'Meridian' });

      expect(result.success).toBe(true);
      expect(result.sharesOutstanding).toBe(10000);
      expect(result.holders[0]).toEqual({
        kind: 'investor_pool', id: 'public', shares: 10000, fraction: 1
      });
    });

    test('should fail for an unknown symbol', () => {
      const { game } = listedGame();
      expect(register(() => game)['get-cap-table']({}, { symbol: 'Nobody' }).success)
        .toBe(false);
    });
  });
});
