const fs = require('fs');
const path = require('path');
const { Game } = require('../game');
const { createUniverse } = require('../universe');
const { EconomyState } = require('../economy/economyState');
const { Exchange, REJECTIONS, SIDES } = require('./exchange');
const { recordOpeningBalance } = require('../economy/transactions');
const {
  ACCOUNTS, playerHolder, corporationHolder, INVESTOR_POOL_HOLDER
} = require('../economy/accounts');
const { ticksPerDay } = require('../economy/clock');
const { investorHolders } = require('../agents/investorPool');

const settings = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'data/default/en-us/game_settings.json'), 'utf-8')
);
const DAY = ticksPerDay(settings);

const ALICE = playerHolder('Alice');
const BOB = playerHolder('Bob');
const ACME = corporationHolder('Acme Orbital');

/**
 * Build an exchange with one listing and two funded traders.
 * @param {Object} [options={}] - `{ referencePrice, aliceShares, bobShares }`.
 * @returns {Object} `{ exchange, economy }`.
 */
function setup({ referencePrice = 50, aliceShares = 0, bobShares = 1000 } = {}) {
  const economy = new EconomyState({ seed: 'exchange' });
  const exchange = economy.getExchange();

  exchange.listCompany({
    corporationName: 'Meridian', referencePrice, sharesOutstanding: aliceShares + bobShares
  });

  [ALICE, BOB].forEach(holder => {
    recordOpeningBalance(economy, { tick: 0, holder, amount: 1000000 });
  });

  exchange.portfolio.adjust(ALICE, 'Meridian', aliceShares);
  exchange.portfolio.adjust(BOB, 'Meridian', bobShares);

  return { exchange, economy };
}

describe('Exchange', () => {
  describe('listing companies', () => {
    test('should create a listing and return the same one again', () => {
      const exchange = new Exchange();
      const first = exchange.listCompany({ corporationName: 'Meridian', referencePrice: 50 });

      expect(exchange.getListing('Meridian')).toBe(first);
      expect(exchange.listCompany({ corporationName: 'Meridian' })).toBe(first);
    });

    test('should return null for a company that is not listed', () => {
      expect(new Exchange().getListing('Nobody')).toBeNull();
    });
  });

  describe('submitOrder', () => {
    test('should accept a valid buy', () => {
      const { exchange } = setup();
      const result = exchange.submitOrder({
        corporationName: 'Meridian', holder: ALICE, side: SIDES.BUY, quantity: 100, limitPrice: 52
      });

      expect(result.accepted).toBe(true);
      expect(result.order.quantity).toBe(100);
    });

    test('should refuse an order on an unknown listing', () => {
      const { exchange } = setup();
      expect(exchange.submitOrder({
        corporationName: 'Nobody', holder: ALICE, side: SIDES.BUY, quantity: 10
      }).reason).toBe(REJECTIONS.UNKNOWN_LISTING);
    });

    test('should refuse malformed orders', () => {
      const { exchange } = setup();
      const bad = extra => exchange.submitOrder({
        corporationName: 'Meridian', holder: ALICE, side: SIDES.BUY, quantity: 10, ...extra
      }).reason;

      expect(bad({ quantity: 0 })).toBe(REJECTIONS.INVALID_ORDER);
      expect(bad({ side: 'sideways' })).toBe(REJECTIONS.INVALID_ORDER);
      expect(bad({ holder: null })).toBe(REJECTIONS.INVALID_ORDER);
    });

    test('should refuse to sell shares the holder does not have', () => {
      const { exchange } = setup({ aliceShares: 0 });

      // No shorting: it needs borrow, margin and a forced cover to be anything
      // other than a way to print money
      expect(exchange.submitOrder({
        corporationName: 'Meridian', holder: ALICE, side: SIDES.SELL, quantity: 10
      }).reason).toBe(REJECTIONS.INSUFFICIENT_SHARES);
    });

    test('should refuse to sell the same shares twice across two orders', () => {
      const { exchange } = setup({ aliceShares: 100 });

      expect(exchange.submitOrder({
        corporationName: 'Meridian', holder: ALICE, side: SIDES.SELL, quantity: 100
      }).accepted).toBe(true);

      // The first order already commits every share held
      expect(exchange.submitOrder({
        corporationName: 'Meridian', holder: ALICE, side: SIDES.SELL, quantity: 1
      }).reason).toBe(REJECTIONS.INSUFFICIENT_SHARES);
    });
  });

  describe('cancelOrder and openOrdersFor', () => {
    test('should cancel and stop listing an order', () => {
      const { exchange } = setup();
      const { order } = exchange.submitOrder({
        corporationName: 'Meridian', holder: ALICE, side: SIDES.BUY, quantity: 10, limitPrice: 50
      });

      expect(exchange.openOrdersFor(ALICE)).toHaveLength(1);
      expect(exchange.cancelOrder('Meridian', order.id, ALICE)).toBe(true);
      expect(exchange.openOrdersFor(ALICE)).toEqual([]);
    });

    test('should report which listing each order belongs to', () => {
      const { exchange } = setup();
      exchange.listCompany({ corporationName: 'Acme Orbital', referencePrice: 20 });
      exchange.submitOrder({
        corporationName: 'Acme Orbital', holder: ALICE, side: SIDES.BUY, quantity: 5, limitPrice: 20
      });

      expect(exchange.openOrdersFor(ALICE)[0].corporationName).toBe('Acme Orbital');
    });

    test('should return false cancelling on an unknown listing', () => {
      expect(new Exchange().cancelOrder('Nobody', 1)).toBe(false);
    });
  });

  describe('clearing and settlement', () => {
    test('should move shares and credits together', () => {
      const { exchange, economy } = setup({ aliceShares: 0, bobShares: 1000 });

      exchange.submitOrder({
        corporationName: 'Meridian', holder: ALICE, side: SIDES.BUY, quantity: 200, limitPrice: 55
      });
      exchange.submitOrder({
        corporationName: 'Meridian', holder: BOB, side: SIDES.SELL, quantity: 200, limitPrice: 50
      });

      const cleared = exchange.clearAll({ economy, tick: DAY });
      const price = cleared[0].clearingPrice;

      expect(exchange.portfolio.sharesHeld(ALICE, 'Meridian')).toBe(200);
      expect(exchange.portfolio.sharesHeld(BOB, 'Meridian')).toBe(800);
      expect(economy.getLedger().balance(ALICE, ACCOUNTS.CASH)).toBe(1000000 - (200 * price));
      expect(economy.getLedger().balance(BOB, ACCOUNTS.CASH)).toBe(1000000 + (200 * price));
    });

    test('should conserve cash and shares', () => {
      const { exchange, economy } = setup({ aliceShares: 500, bobShares: 500 });
      const cashBefore = economy.getLedger().totalAcrossHolders(ACCOUNTS.CASH);

      exchange.submitOrder({
        corporationName: 'Meridian', holder: ALICE, side: SIDES.SELL, quantity: 300, limitPrice: 45
      });
      exchange.submitOrder({
        corporationName: 'Meridian', holder: BOB, side: SIDES.BUY, quantity: 300, limitPrice: 55
      });
      exchange.clearAll({ economy, tick: DAY });

      expect(economy.getLedger().totalAcrossHolders(ACCOUNTS.CASH)).toBe(cashBefore);
      // No shares conjured or destroyed by a fill
      expect(exchange.portfolio.totalHeld('Meridian')).toBe(1000);
      expect(economy.getLedger().audit()).toMatchObject({
        balanced: true, balancesMatch: true
      });
    });

    test('should not trade or move price when nothing crosses', () => {
      const { exchange, economy } = setup();
      exchange.submitOrder({
        corporationName: 'Meridian', holder: ALICE, side: SIDES.BUY, quantity: 10, limitPrice: 40
      });
      exchange.submitOrder({
        corporationName: 'Meridian', holder: BOB, side: SIDES.SELL, quantity: 10, limitPrice: 60
      });

      expect(exchange.clearAll({ economy, tick: DAY })).toEqual([]);
      expect(exchange.getListing('Meridian').lastPrice).toBe(50);
      expect(economy.getLedger().entries.filter(e => e.kind === 'share_trade')).toEqual([]);
    });

    test('should split one buy across several sellers', () => {
      const economy = new EconomyState({ seed: 'split' });
      const exchange = economy.getExchange();
      exchange.listCompany({
        corporationName: 'Meridian', referencePrice: 50, sharesOutstanding: 300
      });

      const carol = playerHolder('Carol');
      [ALICE, BOB, carol].forEach(holder => {
        recordOpeningBalance(economy, { tick: 0, holder, amount: 1000000 });
      });
      exchange.portfolio.adjust(BOB, 'Meridian', 150);
      exchange.portfolio.adjust(carol, 'Meridian', 150);

      exchange.submitOrder({
        corporationName: 'Meridian', holder: BOB, side: SIDES.SELL, quantity: 150, limitPrice: 50
      });
      exchange.submitOrder({
        corporationName: 'Meridian', holder: carol, side: SIDES.SELL, quantity: 150, limitPrice: 50
      });
      exchange.submitOrder({
        corporationName: 'Meridian', holder: ALICE, side: SIDES.BUY, quantity: 300, limitPrice: 55
      });

      exchange.clearAll({ economy, tick: DAY });

      expect(exchange.portfolio.sharesHeld(ALICE, 'Meridian')).toBe(300);
      expect(exchange.portfolio.sharesHeld(BOB, 'Meridian')).toBe(0);
      expect(exchange.portfolio.sharesHeld(carol, 'Meridian')).toBe(0);
      expect(economy.getLedger().audit().balanced).toBe(true);
    });

    test('should clear listings in a fixed order', () => {
      const { exchange, economy } = setup();
      exchange.listCompany({ corporationName: 'Acme Orbital', referencePrice: 20 });
      exchange.listCompany({ corporationName: 'Zenith', referencePrice: 20 });

      exchange.portfolio.adjust(BOB, 'Acme Orbital', 100);
      exchange.portfolio.adjust(BOB, 'Zenith', 100);
      ['Acme Orbital', 'Zenith'].forEach(name => {
        exchange.submitOrder({
          corporationName: name, holder: BOB, side: SIDES.SELL, quantity: 100, limitPrice: 20
        });
        exchange.submitOrder({
          corporationName: name, holder: ALICE, side: SIDES.BUY, quantity: 100, limitPrice: 20
        });
      });

      expect(exchange.clearAll({ economy, tick: DAY }).map(r => r.corporationName))
        .toEqual(['Acme Orbital', 'Zenith']);
    });
  });

  describe('serialization', () => {
    test('should round trip listings and holdings', () => {
      const { exchange, economy } = setup({ aliceShares: 300, bobShares: 700 });
      exchange.submitOrder({
        corporationName: 'Meridian', holder: ALICE, side: SIDES.BUY, quantity: 50, limitPrice: 48
      });
      exchange.clearAll({ economy, tick: DAY });

      const restored = Exchange.fromJSON(JSON.parse(JSON.stringify(exchange.toJSON())));

      expect(restored.getListing('Meridian').lastPrice)
        .toBe(exchange.getListing('Meridian').lastPrice);
      expect(restored.portfolio.sharesHeld(ALICE, 'Meridian')).toBe(300);
      expect(restored.openOrdersFor(ALICE)).toHaveLength(1);
    });

    test('should return a usable exchange from missing data', () => {
      const restored = Exchange.fromJSON(undefined);
      expect(restored.getListing('Meridian')).toBeNull();
      expect(restored.lastClearedTick).toBe(0);
    });

    test('should produce byte-identical output for identical runs', () => {
      const run = () => {
        const { exchange, economy } = setup({ aliceShares: 200, bobShares: 800 });
        exchange.submitOrder({
          corporationName: 'Meridian', holder: ALICE, side: SIDES.BUY, quantity: 100, limitPrice: 52
        });
        exchange.submitOrder({
          corporationName: 'Meridian', holder: BOB, side: SIDES.SELL, quantity: 100, limitPrice: 48
        });
        exchange.clearAll({ economy, tick: DAY });
        return JSON.stringify(exchange.toJSON());
      };

      expect(run()).toBe(run());
    });
  });
});

describe('the exchange in a running game', () => {
  /**
   * Build a started game with a producing world.
   * @returns {Object} An initialized Game.
   */
  function startedGame() {
    const game = new Game(createUniverse(6, 8, 12), settings, { seed: 'listed' });
    game.initializeGame({
      name: 'Trader',
      pronouns: { subject: 'they', object: 'them', possessive: 'their', reflexive: 'themself' },
      description: 'Exchange test player',
      corporation: { name: 'Meridian', description: 'A listed corporation' }
    });
    const corporation = game.getPlayer().corporation;
    const object = game.getUniverse().stellarObjects.find(
      candidate => corporation.stellarObjects.includes(candidate.id)
    );
    if (object) {
      object.buildings = { Farm: { count: 1 } };
    }
    return game;
  }

  describe('going public', () => {
    test('should raise capital into the treasury', () => {
      const game = startedGame();
      const before = game.getPlayer().corporation.getTotalCashReserves();

      const result = game.listCorporation('Meridian', 10000);

      // issueShares alone incremented a counter connected to nothing
      expect(result.success).toBe(true);
      expect(result.proceeds).toBeGreaterThan(0);
      expect(game.getPlayer().corporation.getTotalCashReserves())
        .toBe(before + result.proceeds);
    });

    test('should price off appraised value rather than book value', () => {
      const game = startedGame();
      const corporation = game.getPlayer().corporation;

      // Captured before the float, since the proceeds land on the books and
      // would otherwise be compared against themselves
      const bookBefore = corporation.calculateTotalValue(game.getUniverse());
      const { appraiseCorporation } = require('../economy/appraisal');
      const appraisedBefore = appraiseCorporation(corporation, {
        universe: game.getUniverse(), settings, tick: game.getTicks()
      }).value;

      const result = game.listCorporation('Meridian', 10000);
      const impliedValuation = result.pricePerShare * 10000;

      // A company is floated at what it is expected to earn, not what its
      // assets cost, and for an earning world those differ by a lot
      expect(appraisedBefore).toBeGreaterThan(bookBefore);
      expect(impliedValuation).toBeGreaterThan(bookBefore);
    });

    test('should put the shares in public hands and create a tradeable float', () => {
      const game = startedGame();
      game.listCorporation('Meridian', 10000);

      const exchange = game.getEconomy().getExchange();

      // The issue is spread across the investing public rather than sold to a
      // single account, which is what leaves several holders who can disagree
      // about the price and therefore trade
      const publicHolders = investorHolders(settings);
      const publicShares = publicHolders.reduce(
        (total, holder) => total + exchange.portfolio.sharesHeld(holder, 'Meridian'),
        0
      );

      expect(publicShares).toBe(10000);
      expect(exchange.portfolio.capTable('Meridian').length).toBeGreaterThan(1);
      expect(exchange.getListing('Meridian').sharesOutstanding).toBe(10000);
    });

    test('should conserve cash on flotation', () => {
      const game = startedGame();
      const ledger = game.getEconomy().getLedger();
      const before = ledger.totalAcrossHolders(ACCOUNTS.CASH);

      game.listCorporation('Meridian', 10000);

      // The public pays, so proceeds are a transfer not credits from nowhere
      expect(ledger.totalAcrossHolders(ACCOUNTS.CASH)).toBe(before);
      expect(ledger.audit()).toMatchObject({ balanced: true, balancesMatch: true });
    });

    test('should dilute rather than conjure value when issuing more', () => {
      const game = startedGame();
      const first = game.listCorporation('Meridian', 10000);
      const second = game.listCorporation('Meridian', 10000);

      expect(game.getEconomy().getExchange().getListing('Meridian').sharesOutstanding)
        .toBe(20000);
      expect(second.pricePerShare).toBeLessThan(first.pricePerShare * 2);
    });

    test('should refuse to list a bankrupt or unknown corporation', () => {
      const game = startedGame();
      expect(game.listCorporation('Nobody', 100).success).toBe(false);
      expect(game.listCorporation('Meridian', 0).success).toBe(false);

      game.getPlayer().corporation.isBankrupt = true;
      expect(game.listCorporation('Meridian', 100).reason).toBe('bankrupt');
    });
  });

  /**
   * Move shares from the investing public to another holder.
   *
   * Transferred rather than granted: adding shares to a holder without taking
   * them from anyone would put more on the register than the company has
   * issued, and the cap table is supposed to reconcile to that.
   * @param {Object} exchange - The exchange.
   * @param {Object} holder - Who receives the shares.
   * @param {number} shares - How many.
   * @returns {void}
   */
  function transferFromPublic(exchange, holder, shares) {
    let remaining = shares;

    // The public is several investors now, so take from each in turn rather
    // than from one account that may not hold enough
    investorHolders(settings).forEach(investor => {
      if (remaining <= 0) {
        return;
      }
      const taken = Math.min(remaining, exchange.portfolio.sharesHeld(investor, 'Meridian'));
      if (taken > 0) {
        exchange.portfolio.adjust(investor, 'Meridian', -taken);
        remaining -= taken;
      }
    });

    exchange.portfolio.adjust(holder, 'Meridian', shares - remaining);
  }

  describe('trading through the tick loop', () => {
    test('should fill a resting order while the player flies', () => {
      const game = startedGame();
      const ipo = game.listCorporation('Meridian', 10000);
      const exchange = game.getEconomy().getExchange();
      const player = playerHolder(game.getPlayer());

      // A counterparty other than the investing public, whose orders are
      // withdrawn and re-formed each cycle as its beliefs change
      const seller = playerHolder('Counterparty');
      transferFromPublic(exchange, seller, 500);
      exchange.submitOrder({
        corporationName: 'Meridian', holder: seller,
        side: SIDES.SELL, quantity: 500, limitPrice: ipo.pricePerShare, tick: 0
      });

      expect(game.submitShareOrder({
        corporationName: 'Meridian', holder: player, side: SIDES.BUY,
        // Bid well clear of fair value: the investing public competes for the
        // same stock now, and a token premium no longer wins the auction
        quantity: 300, limitPrice: ipo.pricePerShare * 3
      }).accepted).toBe(true);

      game.advanceTicks(DAY, 'jump');

      // Fills arrive silently: the player discovers them on returning
      expect(exchange.portfolio.sharesHeld(player, 'Meridian')).toBe(300);
    });

    test('should announce a clear on the event bus', () => {
      const game = startedGame();
      const ipo = game.listCorporation('Meridian', 10000);
      const exchange = game.getEconomy().getExchange();

      const seller = playerHolder('Counterparty');
      transferFromPublic(exchange, seller, 100);
      exchange.submitOrder({
        corporationName: 'Meridian', holder: seller,
        side: SIDES.SELL, quantity: 100, limitPrice: ipo.pricePerShare, tick: 0
      });
      game.submitShareOrder({
        corporationName: 'Meridian', holder: playerHolder(game.getPlayer()),
        side: SIDES.BUY, quantity: 100, limitPrice: ipo.pricePerShare + 5
      });

      const listener = jest.fn();
      game.getEventBus().on('exchange-cleared', listener);
      game.advanceTicks(DAY, 'jump');

      // The investing public trades in the same auction, so the announced
      // volume covers the whole clear rather than only this order
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ corporationName: 'Meridian' })
      );
      expect(listener.mock.calls[0][0].volume).toBeGreaterThanOrEqual(100);
      expect(listener.mock.calls[0][0].price).toBeGreaterThan(0);
    });

    test('should reconcile the cap table to shares outstanding', () => {
      const game = startedGame();
      const ipo = game.listCorporation('Meridian', 10000);
      const exchange = game.getEconomy().getExchange();

      const seller = playerHolder('Counterparty');
      transferFromPublic(exchange, seller, 400);
      exchange.submitOrder({
        corporationName: 'Meridian', holder: seller,
        side: SIDES.SELL, quantity: 400, limitPrice: ipo.pricePerShare, tick: 0
      });
      game.submitShareOrder({
        corporationName: 'Meridian', holder: playerHolder(game.getPlayer()),
        side: SIDES.BUY, quantity: 400, limitPrice: ipo.pricePerShare + 5
      });
      game.advanceTicks(DAY * 3, 'jump');

      expect(exchange.portfolio.totalHeld('Meridian'))
        .toBe(exchange.getListing('Meridian').sharesOutstanding);
    });

    test('should survive a save and load with the book intact', () => {
      const game = startedGame();
      const ipo = game.listCorporation('Meridian', 10000);
      const player = playerHolder(game.getPlayer());

      const seller = playerHolder('Counterparty');
      transferFromPublic(game.getEconomy().getExchange(), seller, 200);
      game.getEconomy().getExchange().submitOrder({
        corporationName: 'Meridian', holder: seller,
        side: SIDES.SELL, quantity: 200, limitPrice: ipo.pricePerShare, tick: 0
      });
      game.submitShareOrder({
        corporationName: 'Meridian', holder: player,
        side: SIDES.BUY, quantity: 200, limitPrice: ipo.pricePerShare * 3
      });

      const loaded = Game.loadGame(JSON.parse(JSON.stringify(game.getSaveData())));
      loaded.advanceTicks(DAY, 'jump');

      // The order was placed before the save and filled after the load
      expect(loaded.getEconomy().getExchange().portfolio.sharesHeld(player, 'Meridian'))
        .toBe(200);
    });

    test('should produce the same price series from the same orders', () => {
      // The universe is generated with unseeded randomness, so two games do not
      // share a world and would not share an appraisal or an opening price.
      // This pins the listing's starting price so the assertion is about the
      // exchange rather than about world generation, which is not yet
      // reproducible and is deliberately out of the economy's scope.
      const run = () => {
        const economy = new EconomyState({ seed: 'series' });
        const exchange = economy.getExchange();
        exchange.listCompany({
          corporationName: 'Meridian', referencePrice: 80, sharesOutstanding: 10000
        });

        recordOpeningBalance(economy, { tick: 0, holder: ALICE, amount: 10000000 });
        exchange.portfolio.adjust(BOB, 'Meridian', 10000);

        for (let day = 1; day <= 5; day += 1) {
          exchange.submitOrder({
            corporationName: 'Meridian', holder: BOB,
            side: SIDES.SELL, quantity: 100, limitPrice: 80 + day, tick: day * DAY
          });
          exchange.submitOrder({
            corporationName: 'Meridian', holder: ALICE,
            side: SIDES.BUY, quantity: 100, limitPrice: 81 + day, tick: day * DAY
          });
          exchange.clearAll({ economy, tick: day * DAY });
        }

        return JSON.stringify(exchange.getListing('Meridian').history);
      };

      const series = run();
      expect(series).toBe(run());
      // And it is a real series, not an empty one passing vacuously
      expect(JSON.parse(series)).toHaveLength(5);
    });
  });
});
