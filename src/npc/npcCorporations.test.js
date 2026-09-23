const fs = require('fs');
const path = require('path');
const { Game } = require('../game');
const { createUniverse } = require('../universe');
const {
  npcCorporationConfig, corporationNames, createNpcCorporations,
  corporateCycleTicks, corporateCreditSupport, runNpcCorporations, pickAgentName
} = require('./npcCorporations');
const { buildingScore, buildOnWorld } = require('./agents/marketAgent');
const { agentNames, DEFAULT_AGENT_NAME } = require('./agents');

/**
 * Run a corporate turn including the slower build cadence.
 * @param {Object} params - `{ game, tick }`.
 * @returns {Array<Object>} Build actions taken.
 */
function runCorporateAI({ game, tick }) {
  return runNpcCorporations({ game, tick, buildThisCycle: true })
    .filter(action => action.kind === 'build');
}
const {
  investorConfig, investorHolder, investorHolders, seedInvestorPool,
  accrueSavings, fairValuePerShare, ordersForListing, clearPoolOrders,
  runInvestorPool, investorCapital
} = require('./investorPool');
const { dividendDue, payDividend } = require('../economy/dividends');
const { RandomSource } = require('../economy/rng');
const { ACCOUNTS, corporationHolder, playerHolder } = require('../economy/accounts');
const { ticksPerDay, ticksPerQuarter } = require('../economy/clock');
const { defaultSettings } = require('../settings');

const settings = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'data/default/en-us/game_settings.json'), 'utf-8')
);
const DAY = ticksPerDay(settings);

/**
 * Build a started game.
 * @param {Object} [options={}] - `{ seed, objects }`.
 * @returns {Object} An initialized Game.
 */
function startedGame({ seed = 'agents', objects = 30 } = {}) {
  const game = new Game(createUniverse(8, 12, objects), settings, { seed });
  game.initializeGame({
    name: 'Trader',
    pronouns: { subject: 'they', object: 'them', possessive: 'their', reflexive: 'themself' },
    description: 'Agent test player',
    corporation: { name: 'PlayerCo', description: 'The player corporation' }
  });
  return game;
}

describe('NPC corporation configuration', () => {
  test('should read configured values and keep a configured zero', () => {
    expect(npcCorporationConfig(settings).count).toBeGreaterThan(0);
    expect(npcCorporationConfig({ npc_corporations: { build_cash_floor: 0 } }).buildCashFloor)
      .toBe(0);
  });

  test('should fall back for missing or unusable values', () => {
    const shipped = defaultSettings().npc_corporations.count;

    expect(npcCorporationConfig({}).count).toBe(shipped);
    expect(npcCorporationConfig({ npc_corporations: { count: 'x' } }).count).toBe(shipped);
  });

  test('should derive the decision cadence from the clock', () => {
    expect(corporateCycleTicks(settings))
      .toBe(npcCorporationConfig(settings).buildCheckDays * DAY);
  });
});

describe('corporationNames', () => {
  test('should generate the requested number of distinct names', () => {
    const names = corporationNames(12, new RandomSource('names').stream('a'));
    expect(names).toHaveLength(12);
    expect(new Set(names).size).toBe(12);
  });

  test('should be reproducible from the same stream', () => {
    const first = corporationNames(6, new RandomSource('same').stream('a'));
    const second = corporationNames(6, new RandomSource('same').stream('a'));
    expect(second).toEqual(first);
  });

  test('should return nothing when the pool is unavailable', () => {
    expect(corporationNames(5, new RandomSource('x').stream('a'), 'nowhere')).toEqual([]);
  });
});

describe('createNpcCorporations', () => {
  test('should create the configured number and leave the player alone', () => {
    const game = startedGame();
    const all = game.getCorporations();
    const npcs = all.filter(corporation => !corporation.isPlayerOwned);

    expect(npcs).toHaveLength(npcCorporationConfig(settings).count);
    expect(all.filter(corporation => corporation.isPlayerOwned)).toHaveLength(1);
  });

  test('should give each of them worlds they can actually develop', () => {
    const game = startedGame();

    game.getCorporations()
      .filter(corporation => !corporation.isPlayerOwned)
      .forEach(corporation => {
        corporation.stellarObjects.forEach(objectId => {
          const object = game.findStellarObject(objectId);
          // A world it cannot build on or store goods at would sit inert and
          // report nothing, which defeats the point of owning it
          expect(object.capabilities.buildings).toBe(true);
          expect(object.marketState).not.toBeNull();
          expect(object.owner).toBe(corporation.name);
        });
      });
  });

  test('should not take worlds the player already owns', () => {
    const game = startedGame();
    const playerWorlds = game.getPlayer().corporation.stellarObjects;

    game.getCorporations()
      .filter(corporation => !corporation.isPlayerOwned)
      .forEach(corporation => {
        corporation.stellarObjects.forEach(objectId => {
          expect(playerWorlds).not.toContain(objectId);
        });
      });
  });

  test('should fund them without creating credits twice', () => {
    const game = startedGame();
    const ledger = game.getEconomy().getLedger();

    game.getCorporations()
      .filter(corporation => !corporation.isPlayerOwned)
      .forEach(corporation => {
        expect(ledger.balance(corporationHolder(corporation), ACCOUNTS.CASH))
          .toBe(npcCorporationConfig(settings).startingCash);
      });

    expect(ledger.audit().cashMatches).toBe(true);
  });
});

describe('agent assignment', () => {
  test('should give every NPC corporation an agent and leave the player without one', () => {
    const game = startedGame();

    game.getCorporations().forEach(corporation => {
      if (corporation.isPlayerOwned) {
        expect(corporation.agentName).toBeNull();
      } else {
        expect(agentNames()).toContain(corporation.agentName);
      }
    });
  });

  test('should follow the configured mix', () => {
    const stream = { float: () => 0.1 };

    expect(pickAgentName({ market: 0, military: 1 }, stream)).toBe('military');
    expect(pickAgentName({ market: 1, military: 0 }, stream)).toBe('market');
  });

  test('should fall back to the default when no agent has any weight', () => {
    const stream = { float: () => 0 };

    expect(pickAgentName({}, stream)).toBe(DEFAULT_AGENT_NAME);
    expect(pickAgentName({ market: 0, military: 0 }, stream)).toBe(DEFAULT_AGENT_NAME);
  });

  test('should survive a save and load', () => {
    const game = startedGame();
    const before = game.getCorporations()
      .filter(corporation => !corporation.isPlayerOwned)
      .map(corporation => [corporation.name, corporation.agentName]);

    const restored = game.getCorporations().map(
      corporation => Game.deserializeCorporation(JSON.parse(JSON.stringify(corporation)))
    );

    before.forEach(([name, agentName]) => {
      expect(restored.find(corporation => corporation.name === name).agentName)
        .toBe(agentName);
    });
  });
});

describe('buildingScore', () => {
  test('should rank productive buildings above inert ones', () => {
    const buildings = require('../contentCache').loadContent('buildings');
    expect(buildingScore(buildings.Mine)).toBeGreaterThan(buildingScore(buildings.Warehouse));
    expect(buildingScore(buildings.Farm)).toBeGreaterThan(0);
    expect(buildingScore(buildings.Warehouse)).toBe(0);
  });

  test('should tolerate a missing definition', () => {
    expect(buildingScore(undefined)).toBe(0);
  });
});

describe('corporateCreditSupport', () => {
  test('should fund construction from the corporation treasury', () => {
    const game = startedGame();
    const corporation = game.getCorporations().find(c => !c.isPlayerOwned);
    const support = corporateCreditSupport(corporation, (key, vars, fallback) => fallback);

    expect(support.availableCredits).toBe(corporation.getTotalCashReserves());
    expect(support.spendCredits(1000)).toBe(true);
    expect(support.availableCredits).toBe(npcCorporationConfig(settings).startingCash - 1000);
  });

  test('should refuse a spend it cannot cover', () => {
    const game = startedGame();
    const corporation = game.getCorporations().find(c => !c.isPlayerOwned);
    const support = corporateCreditSupport(corporation, (key, vars, fallback) => fallback);

    expect(support.spendCredits(999999999)).toBe(false);
  });
});

describe('runCorporateAI', () => {
  test('should start construction for corporations that can afford it', () => {
    const game = startedGame();
    const started = runCorporateAI({ game, tick: DAY * 7 });

    expect(started.length).toBeGreaterThan(0);
    started.forEach(build => {
      expect(build.corporationName).toBeDefined();
      expect(build.buildingType).toBeDefined();
    });
  });

  test('should prefer buildings that earn', () => {
    const game = startedGame();
    const started = runCorporateAI({ game, tick: DAY * 7 });
    const buildings = require('../contentCache').loadContent('buildings');

    // Extraction is what generates revenue, and therefore what makes one
    // company's statements differ from another's
    const productive = started.filter(build => buildingScore(buildings[build.buildingType]) > 0);
    expect(productive.length).toBeGreaterThan(0);
  });

  test('should leave the player corporation alone', () => {
    const game = startedGame();
    const started = runCorporateAI({ game, tick: DAY * 7 });

    expect(started.some(build => build.corporationName === 'PlayerCo')).toBe(false);
  });

  test('should not build below the cash floor', () => {
    const game = startedGame();
    game.getCorporations()
      .filter(corporation => !corporation.isPlayerOwned)
      .forEach(corporation => corporation.setCashPosition(1));

    expect(runCorporateAI({ game, tick: DAY * 7 })).toEqual([]);
  });

  test('should skip bankrupt corporations', () => {
    const game = startedGame();
    game.getCorporations()
      .filter(corporation => !corporation.isPlayerOwned)
      .forEach(corporation => { corporation.isBankrupt = true; });

    expect(runCorporateAI({ game, tick: DAY * 7 })).toEqual([]);
  });

  test('should conserve credits while building', () => {
    const game = startedGame();
    runCorporateAI({ game, tick: DAY * 7 });

    expect(game.getEconomy().getLedger().audit().cashMatches).toBe(true);
  });
});

describe('buildOnWorld', () => {
  test('should return null when the corporation cannot pay', () => {
    const game = startedGame();
    const corporation = game.getCorporations()
      .find(c => !c.isPlayerOwned && c.stellarObjects.length > 0);
    corporation.setCashPosition(0);

    const stellarObject = game.findStellarObject(corporation.stellarObjects[0]);
    expect(buildOnWorld({ game, corporation, stellarObject })).toBeNull();
  });
});

describe('investor configuration and holders', () => {
  test('should build distinct holders', () => {
    expect(investorHolder(0)).toEqual({ kind: 'investor_pool', id: 'investor-0' });
    expect(investorHolders(settings)).toHaveLength(investorConfig(settings).investorCount);
  });

  test('should never produce fewer than one investor', () => {
    expect(investorHolders({ investors: { investor_count: 0 } })).toHaveLength(1);
  });
});

describe('seedInvestorPool and savings', () => {
  test('should split opening capital across investors', () => {
    const game = startedGame();
    const ledger = game.getEconomy().getLedger();
    const holders = investorHolders(settings);

    holders.forEach(holder => {
      expect(ledger.balance(holder, ACCOUNTS.CASH)).toBeGreaterThan(0);
    });

    // One investor spending its capital stops that investor bidding while the
    // others carry on, which is how a market thins rather than stopping
    expect(investorCapital(game.getEconomy(), settings))
      .toBeCloseTo(investorConfig(settings).startingCapital, -3);
  });

  test('should add savings as a recorded inflow', () => {
    const game = startedGame();
    const before = investorCapital(game.getEconomy(), settings);

    const added = accrueSavings({
      economy: game.getEconomy(), settings, days: 1, tick: DAY
    });

    expect(added).toBeGreaterThan(0);
    expect(investorCapital(game.getEconomy(), settings)).toBe(before + added);
    expect(game.getEconomy().getLedger().capitalByReason().investor_savings)
      .toBe(added);
  });

  test('should add nothing for zero days', () => {
    const game = startedGame();
    expect(accrueSavings({
      economy: game.getEconomy(), settings, days: 0, tick: DAY
    })).toBe(0);
  });
});

describe('flotation across the public', () => {
  test('should spread an issue across investors', () => {
    const game = startedGame();
    const corporation = game.getCorporations().find(c => !c.isPlayerOwned);
    game.listCorporation(corporation.name, 10000);

    const exchange = game.getEconomy().getExchange();
    const table = exchange.portfolio.capTable(corporation.name);

    // Several holders who can disagree about the price, rather than one
    // account that can only ever be on one side of the market
    expect(table.length).toBeGreaterThan(1);
    expect(table.reduce((total, row) => total + row.shares, 0)).toBe(10000);
  });

  test('should conserve credits on flotation', () => {
    const game = startedGame();
    const corporation = game.getCorporations().find(c => !c.isPlayerOwned);
    game.listCorporation(corporation.name, 10000);

    expect(game.getEconomy().getLedger().audit().cashMatches).toBe(true);
  });
});

describe('investor beliefs and orders', () => {
  test('should value a share from appraisal, not from the last price', () => {
    const game = startedGame();
    const corporation = game.getCorporations().find(c => !c.isPlayerOwned);
    game.listCorporation(corporation.name, 10000);
    const listing = game.getEconomy().getExchange().getListing(corporation.name);

    const believed = fairValuePerShare({ game, corporation, listing });
    listing.lastPrice = 999999;

    // Beliefs anchored to what a company earns, not to what the market last
    // did, is what stops price feeding on itself
    expect(fairValuePerShare({ game, corporation, listing })).toBe(believed);
  });

  test('should value a bankrupt company at nothing', () => {
    const game = startedGame();
    const corporation = game.getCorporations().find(c => !c.isPlayerOwned);
    game.listCorporation(corporation.name, 10000);
    const listing = game.getEconomy().getExchange().getListing(corporation.name);

    corporation.isBankrupt = true;
    expect(fairValuePerShare({ game, corporation, listing })).toBe(0);
  });

  test('should produce orders on both sides across investors', () => {
    const game = startedGame();
    const corporation = game.getCorporations().find(c => !c.isPlayerOwned);
    game.listCorporation(corporation.name, 10000);

    const exchange = game.getEconomy().getExchange();
    const listing = exchange.getListing(corporation.name);
    const stream = game.getEconomy().getRandom().stream('test-orders');

    const orders = investorHolders(settings).flatMap(
      holder => ordersForListing({ game, listing, holder, stream })
    );

    expect(orders.some(order => order.side === 'buy')).toBe(true);
    expect(orders.some(order => order.side === 'sell')).toBe(true);
  });

  test('should not bid with money it does not have', () => {
    const game = startedGame();
    const corporation = game.getCorporations().find(c => !c.isPlayerOwned);
    game.listCorporation(corporation.name, 10000);

    const exchange = game.getEconomy().getExchange();
    const listing = exchange.getListing(corporation.name);
    const ledger = game.getEconomy().getLedger();
    const holder = investorHolder(0);
    const stream = game.getEconomy().getRandom().stream('broke');

    const cash = ledger.balance(holder, ACCOUNTS.CASH);
    const orders = ordersForListing({ game, listing, holder, stream });

    orders.filter(order => order.side === 'buy').forEach(order => {
      expect(order.quantity * order.limitPrice).toBeLessThanOrEqual(cash);
    });
  });

  test('should withdraw its orders so stale beliefs do not keep trading', () => {
    const game = startedGame();
    const corporation = game.getCorporations().find(c => !c.isPlayerOwned);
    game.listCorporation(corporation.name, 10000);
    const exchange = game.getEconomy().getExchange();

    runInvestorPool({ game, days: 1, tick: DAY });
    const placed = investorHolders(settings)
      .reduce((total, holder) => total + exchange.openOrdersFor(holder).length, 0);
    expect(placed).toBeGreaterThan(0);

    const cancelled = clearPoolOrders(exchange, investorHolders(settings));
    expect(cancelled).toBe(placed);
  });
});

describe('dividends', () => {
  test('should distribute a share of earnings', () => {
    const corporation = { dividendRate: 25 };
    expect(dividendDue(corporation, 40000)).toBe(10000);
  });

  test('should pay nothing on a loss, however much cash is held', () => {
    // Paying out of capital drains a treasury into shareholders' pockets while
    // the business fails, which is exactly what a player would do
    expect(dividendDue({ dividendRate: 50 }, -10000)).toBe(0);
  });

  test('should pay nothing at a zero rate', () => {
    expect(dividendDue({ dividendRate: 0 }, 40000)).toBe(0);
  });

  test('should pay shareholders in proportion and conserve credits', () => {
    const game = startedGame();
    const corporation = game.getCorporations().find(c => !c.isPlayerOwned);
    game.listCorporation(corporation.name, 10000);

    const economy = game.getEconomy();
    const before = economy.getLedger().audit().totalCash;

    const result = payDividend({ economy, corporation, amount: 8000, tick: DAY });

    expect(result.paid).toBe(8000);
    expect(result.recipients).toBeGreaterThan(1);
    expect(economy.getLedger().audit().totalCash).toBe(before);
  });

  test('should pay nothing for an unlisted company', () => {
    const game = startedGame();
    const corporation = game.getCorporations().find(c => !c.isPlayerOwned);

    expect(payDividend({
      economy: game.getEconomy(), corporation, amount: 5000, tick: DAY
    })).toEqual({ paid: 0, recipients: 0 });
  });

  test('should pay dividends when a quarter closes', () => {
    const game = startedGame();
    game.getCorporations()
      .filter(corporation => !corporation.isPlayerOwned)
      .slice(0, 3)
      .forEach(corporation => {
        corporation.setDividendRate(30);
        game.listCorporation(corporation.name, 10000);
      });

    const listener = jest.fn();
    game.getEventBus().on('dividend-paid', listener);
    game.advanceTicks(ticksPerQuarter(settings) * 2, 'test');

    expect(listener).toHaveBeenCalled();
  });
});

describe('the agents through the tick loop', () => {
  test('should trade, build, and pay while conserving credits', () => {
    const game = startedGame({ seed: 'loop' });
    game.getCorporations()
      .filter(corporation => !corporation.isPlayerOwned)
      .slice(0, 3)
      .forEach(corporation => {
        corporation.setDividendRate(30);
        game.listCorporation(corporation.name, 10000);
      });

    let clears = 0;
    let builds = 0;
    game.getEventBus().on('exchange-cleared', () => { clears += 1; });
    game.getEventBus().on('corporation-built', () => { builds += 1; });

    game.advanceTicks(ticksPerQuarter(settings), 'test');

    expect(clears).toBeGreaterThan(0);
    expect(builds).toBeGreaterThan(0);
    expect(game.getEconomy().getLedger().audit().cashMatches).toBe(true);
  });

  test('should give companies differing results', () => {
    const game = startedGame({ seed: 'divergence' });
    const listed = game.getCorporations()
      .filter(corporation => !corporation.isPlayerOwned)
      .slice(0, 4);
    listed.forEach(corporation => game.listCorporation(corporation.name, 10000));

    game.advanceTicks(ticksPerQuarter(settings) * 2, 'test');

    const incomes = listed.map(corporation => {
      const statements = game.getEconomy().getStatements()
        .forHolder(corporationHolder(corporation));
      return statements.length > 0 ? statements[statements.length - 1].income.netIncome : 0;
    });

    // Worlds differ in what they can produce and how many people they feed, so
    // the same policy produces different results
    expect(new Set(incomes).size).toBeGreaterThan(1);
  });

  test('should keep the player out of the agents’ way', () => {
    const game = startedGame({ seed: 'player' });
    const playerCorp = game.getPlayer().corporation;
    const worldsBefore = [...playerCorp.stellarObjects];

    game.advanceTicks(ticksPerQuarter(settings), 'test');

    expect(playerCorp.stellarObjects).toEqual(worldsBefore);
  });
});
