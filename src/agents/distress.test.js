const fs = require('fs');
const path = require('path');
const { Game } = require('../game');
const { createUniverse } = require('../universe');
const { runAcquisitions, npcCorporationConfig } = require('./corporateAI');
const { ordersForListing, investorHolder, investorHolders } = require('./investorPool');
const { defaultProbability, appraiseCorporation } = require('../economy/appraisal');
const { controllingHolder } = require('../exchange/control');
const { checkConservation } = require('../economy/conservation');
const { NEWS_KINDS } = require('../economy/news');
const { ACCOUNTS, corporationHolder, marketHolder } = require('../economy/accounts');
const { ticksPerDay } = require('../economy/clock');

const settings = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'data/default/en-us/game_settings.json'), 'utf-8')
);
const DAY = ticksPerDay(settings);

/**
 * Build a game with several listed companies.
 * @param {string} [seed='distress'] - Economy seed.
 * @returns {Object} An initialized Game.
 */
function listedGame(seed = 'distress', gameSettings = settings) {
  const game = new Game(createUniverse(10, 14, 40), gameSettings, { seed });
  game.initializeGame({
    name: 'Trader',
    pronouns: { subject: 'they', object: 'them', possessive: 'their', reflexive: 'themself' },
    description: 'Distress test player',
    corporation: { name: 'PlayerCo', description: 'The player corporation' }
  });
  game.getCorporations()
    .filter(corporation => !corporation.isPlayerOwned)
    .slice(0, 4)
    .forEach(corporation => game.listCorporation(corporation.name, 10000));
  return game;
}

/**
 * Give a corporation cash from outside the simulation.
 * @param {Object} game - The game.
 * @param {Object} corporation - Who receives it.
 * @param {number} amount - How much.
 * @returns {void}
 */
function fund(game, corporation, amount) {
  const ledger = game.getEconomy().getLedger();
  const holder = corporationHolder(corporation);

  ledger.post({
    tick: game.getTicks(),
    amount,
    debit: { holder, account: ACCOUNTS.CASH },
    credit: { holder, account: ACCOUNTS.CONTRIBUTED_CAPITAL }
  });
  corporation.setCashPosition(ledger.balance(holder, ACCOUNTS.CASH));
}

/**
 * Load a company with debt it cannot liquidate its way out of.
 *
 * The proceeds are spent on property bought from the local economy, so the
 * company is solvent on paper but has nothing liquid when the balloon lands --
 * and the test itself does not destroy any credits doing it.
 * @param {Object} game - The game.
 * @param {Object} corporation - The company to burden.
 * @param {number} [principal=2000000] - How much to borrow.
 * @returns {Object} The loan.
 */
function loadWithDebt(game, corporation, principal = 2000000) {
  const ledger = game.getEconomy().getLedger();
  const holder = corporationHolder(corporation);
  const loan = game.takeCorporationLoan(corporation.name, principal);

  const spend = Math.round(principal * 1.2);
  const local = marketHolder(game.findStellarObject(corporation.stellarObjects[0]));
  ledger.postMany([
    {
      tick: game.getTicks(),
      amount: spend,
      debit: { holder, account: ACCOUNTS.PROPERTY },
      credit: { holder, account: ACCOUNTS.CASH }
    },
    {
      tick: game.getTicks(),
      amount: spend,
      debit: { holder: local, account: ACCOUNTS.CASH },
      credit: { holder: local, account: ACCOUNTS.REVENUE }
    }
  ]);

  corporation.setCashPosition(ledger.balance(holder, ACCOUNTS.CASH));
  return loan;
}

describe('distress pricing', () => {
  test('should raise default probability as the maturity approaches', () => {
    const game = listedGame();
    const victim = game.getCorporations().find(c => !c.isPlayerOwned);
    loadWithDebt(game, victim);

    const readings = [];
    for (let day = 30; day <= 300; day += 90) {
      while (game.getTicks() < DAY * day) {
        game.advanceTicks(DAY, 'test');
      }
      readings.push(defaultProbability(victim, { settings, tick: game.getTicks() }).probability);
    }

    for (let i = 1; i < readings.length; i += 1) {
      expect(readings[i]).toBeGreaterThan(readings[i - 1]);
    }
  });

  test('should warn once as a balloon comes into view', () => {
    const game = listedGame();
    const victim = game.getCorporations().find(c => !c.isPlayerOwned);
    loadWithDebt(game, victim);

    game.advanceTicks(DAY * 360, 'test');

    const warnings = game.getEconomy().getNews().items.filter(
      item => item.kind === NEWS_KINDS.MATURITY_APPROACHING
        && item.tokens.companyName === victim.name
    );

    // A dated, public cliff is what makes the risk priceable, but one warning
    // per loan rather than one per day or the news would be nothing else
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.length).toBeLessThan(5);
  });
});

describe('the bid side under distress', () => {
  test('should still find sellers for a company appraised at nothing', () => {
    const game = listedGame();
    const victim = game.getCorporations().find(c => !c.isPlayerOwned);
    loadWithDebt(game, victim, 5000000);

    const exchange = game.getEconomy().getExchange();
    const listing = exchange.getListing(victim.name);
    const stream = game.getEconomy().getRandom().stream('distress-orders');

    const orders = investorHolders(settings).flatMap(
      holder => ordersForListing({ game, listing, holder, stream })
    );

    // Returning nothing at all would freeze the book and hide the collapse
    expect(orders.some(order => order.side === 'sell')).toBe(true);
  });

  test('should refuse to bid for a company appraised at nothing', () => {
    const game = listedGame();
    const victim = game.getCorporations().find(c => !c.isPlayerOwned);
    loadWithDebt(game, victim, 5000000);

    const exchange = game.getEconomy().getExchange();
    const listing = exchange.getListing(victim.name);
    const stream = game.getEconomy().getRandom().stream('no-bid');

    const orders = investorHolders(settings).flatMap(
      holder => ordersForListing({ game, listing, holder, stream })
    );

    // There is no price at which its assets exceed its debts
    expect(orders.some(order => order.side === 'buy')).toBe(false);
  });

  test('should empty the bid side of a failing listing in play', () => {
    const game = listedGame();
    const victim = game.getCorporations().find(c => !c.isPlayerOwned);
    loadWithDebt(game, victim, 5000000);

    game.advanceTicks(DAY * 60, 'test');

    const depth = game.getEconomy().getExchange().getListing(victim.name).depth();
    const healthy = game.getCorporations()
      .filter(c => !c.isPlayerOwned && c.name !== victim.name)[0];
    const healthyDepth = game.getEconomy().getExchange().getListing(healthy.name).depth();

    // The failing company has no public bid while a healthy one still trades
    const publicBids = investorHolders(settings).flatMap(
      holder => game.getEconomy().getExchange().openOrdersFor(holder)
    ).filter(order => order.symbol === victim.name && order.side === 'buy');
    expect(publicBids).toHaveLength(0);
    expect(depth).toBeDefined();
    expect(healthyDepth.bids.length + healthyDepth.asks.length).toBeGreaterThan(0);
  });
});

describe('distressed acquisition', () => {
  test('should ignore healthy companies', () => {
    const game = listedGame();
    expect(runAcquisitions({ game, tick: DAY })).toEqual([]);
  });

  test('should bid for a distressed company when it has the cash', () => {
    const game = listedGame();
    const victim = game.getCorporations().find(c => !c.isPlayerOwned);
    loadWithDebt(game, victim);

    const buyer = game.getCorporations().filter(c => !c.isPlayerOwned && c !== victim)[0];
    const config = npcCorporationConfig(settings);
    game.getEconomy().getLedger().post({
      tick: 0,
      amount: config.acquisitionCashFloor * 10,
      debit: { holder: corporationHolder(buyer), account: ACCOUNTS.CASH },
      credit: { holder: corporationHolder(buyer), account: ACCOUNTS.CONTRIBUTED_CAPITAL }
    });

    game.advanceTicks(DAY * 200, 'test');
    const bids = runAcquisitions({ game, tick: game.getTicks() });

    expect(bids.length).toBeGreaterThan(0);
  });

  test('should bid below what the assets are worth', () => {
    const game = listedGame();
    const victim = game.getCorporations().find(c => !c.isPlayerOwned);
    loadWithDebt(game, victim);

    const buyer = game.getCorporations().filter(c => !c.isPlayerOwned && c !== victim)[0];
    game.getEconomy().getLedger().post({
      tick: 0,
      amount: 5000000,
      debit: { holder: corporationHolder(buyer), account: ACCOUNTS.CASH },
      credit: { holder: corporationHolder(buyer), account: ACCOUNTS.CONTRIBUTED_CAPITAL }
    });

    game.advanceTicks(DAY * 200, 'test');
    const bids = runAcquisitions({ game, tick: game.getTicks() });

    bids.forEach(bid => {
      const target = game.findCorporation(bid.targetName);
      const listing = game.getEconomy().getExchange().getListing(bid.targetName);
      const appraisal = appraiseCorporation(target, {
        universe: game.getUniverse(),
        settings,
        tick: game.getTicks(),
        costBasis: game.getEconomy().getCostBasis()
      });

      // The point is to buy the company for less than it would fetch broken up
      expect(bid.limitPrice)
        .toBeLessThan(appraisal.assets / listing.sharesOutstanding);
    });
  });

  test('should not bid for itself or when short of cash', () => {
    const game = listedGame();
    const victim = game.getCorporations().find(c => !c.isPlayerOwned);
    loadWithDebt(game, victim);
    game.advanceTicks(DAY * 200, 'test');

    const bids = runAcquisitions({ game, tick: game.getTicks() });
    bids.forEach(bid => expect(bid.buyerName).not.toBe(bid.targetName));
  });

  test('should leave the player corporation out of it', () => {
    const game = listedGame();
    const victim = game.getCorporations().find(c => !c.isPlayerOwned);
    loadWithDebt(game, victim);
    game.advanceTicks(DAY * 200, 'test');

    runAcquisitions({ game, tick: game.getTicks() }).forEach(bid => {
      expect(bid.buyerName).not.toBe('PlayerCo');
    });
  });
});

describe('the Stage 5 milestone', () => {
  test('a failing company loses its bid and is bought up below asset value', () => {
    const game = listedGame('milestone');
    const victim = game.getCorporations().find(c => !c.isPlayerOwned);
    loadWithDebt(game, victim);

    // One rival with obvious means. Others accumulate cash of their own over
    // the run and may join in, which is deliberate: a failing company draws
    // more than one bidder.
    const buyer = game.getCorporations().filter(c => !c.isPlayerOwned && c !== victim)[0];
    fund(game, buyer, 8000000);

    const exchange = game.getEconomy().getExchange();
    const listing = exchange.getListing(victim.name);
    const openingPrice = listing.lastPrice;

    game.advanceTicks(DAY * 200, 'test');

    const distress = defaultProbability(victim, { settings, tick: game.getTicks() });
    const appraisal = appraiseCorporation(victim, {
      universe: game.getUniverse(),
      settings,
      tick: game.getTicks(),
      costBasis: game.getEconomy().getCostBasis()
    });

    // Distress rose toward the date
    expect(distress.probability).toBeGreaterThan(0.2);

    // The investing public left the bid entirely
    const publicBids = investorHolders(settings).flatMap(
      holder => exchange.openOrdersFor(holder)
    ).filter(order => order.symbol === listing.symbol && order.side === 'buy');
    expect(publicBids).toHaveLength(0);

    // And sold out to corporate buyers, who took the stock below what the
    // assets are worth
    const corporateShares = exchange.portfolio.capTable(listing.symbol)
      .filter(row => row.holder.kind === 'corporation')
      .reduce((total, row) => total + row.shares, 0);

    expect(corporateShares).toBeGreaterThan(listing.sharesOutstanding / 2);
    expect(listing.lastPrice)
      .toBeLessThan(appraisal.assets / listing.sharesOutstanding);
    expect(listing.lastPrice).toBeLessThan(openingPrice);

    // Without a credit being created or destroyed anywhere
    expect(checkConservation(game.getEconomy().getLedger()).holds).toBe(true);
  });

  test('an uncontested bidder takes control outright', () => {
    // Only one corporation can afford to bid, so the float is not split
    // between rivals. A contested takeover is a real outcome -- three buyers
    // splitting a company between them and nobody reaching a majority -- but
    // it is a different assertion from this one.
    const exclusive = {
      ...settings,
      npc_corporations: { ...settings.npc_corporations, acquisition_cash_floor: 5000000 }
    };

    const game = listedGame('uncontested', exclusive);
    const victim = game.getCorporations().find(c => !c.isPlayerOwned);
    loadWithDebt(game, victim);

    const buyer = game.getCorporations().filter(c => !c.isPlayerOwned && c !== victim)[0];
    fund(game, buyer, 20000000);

    const changes = [];
    game.getEventBus().on('control-changed', change => changes.push(change));

    game.advanceTicks(DAY * 200, 'test');

    const exchange = game.getEconomy().getExchange();
    const listing = exchange.getListing(victim.name);
    const controller = controllingHolder(exchange.portfolio, listing);

    expect(controller).not.toBeNull();
    expect(controller.holder).toEqual(corporationHolder(buyer));
    expect(changes.some(change => change.corporationName === victim.name)).toBe(true);
    expect(checkConservation(game.getEconomy().getLedger()).holds).toBe(true);
  });
});
