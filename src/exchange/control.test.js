const fs = require('fs');
const path = require('path');
const { Game } = require('../game');
const { createUniverse } = require('../universe');
const { EconomyState } = require('../economy/economyState');
const {
  CONTROL_THRESHOLD, controllingHolder, detectControlChanges, controls
} = require('./control');
const { playerHolder, corporationHolder, holderKey } = require('../economy/accounts');
const { ticksPerDay } = require('../economy/clock');

const settings = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'data/default/en-us/game_settings.json'), 'utf-8')
);
const ALICE = playerHolder('Alice');
const BOB = playerHolder('Bob');
const ACME = corporationHolder('Acme Orbital');

/**
 * Build an exchange with one listing.
 * @param {number} [outstanding=10000] - Shares in existence.
 * @returns {Object} `{ exchange, listing }`.
 */
function setup(outstanding = 10000) {
  const exchange = new EconomyState({ seed: 'control' }).getExchange();
  const listing = exchange.listCompany({
    corporationName: 'Meridian', referencePrice: 50, sharesOutstanding: outstanding
  });
  return { exchange, listing };
}

describe('controllingHolder', () => {
  test('should report nobody when the register is empty', () => {
    const { exchange, listing } = setup();
    expect(controllingHolder(exchange.portfolio, listing)).toBeNull();
  });

  test('should report nobody when no holding is a majority', () => {
    const { exchange, listing } = setup();
    exchange.portfolio.adjust(ALICE, 'Meridian', 4000);
    exchange.portfolio.adjust(BOB, 'Meridian', 4000);

    expect(controllingHolder(exchange.portfolio, listing)).toBeNull();
  });

  test('should require strictly more than half', () => {
    const { exchange, listing } = setup();
    exchange.portfolio.adjust(ALICE, 'Meridian', 5000);
    exchange.portfolio.adjust(BOB, 'Meridian', 5000);

    // An exact half is a deadlock, not control
    expect(controllingHolder(exchange.portfolio, listing)).toBeNull();

    exchange.portfolio.adjust(ALICE, 'Meridian', 1);
    expect(controllingHolder(exchange.portfolio, listing).holder).toEqual(ALICE);
  });

  test('should report the majority holder and their share', () => {
    const { exchange, listing } = setup();
    exchange.portfolio.adjust(ALICE, 'Meridian', 7500);
    exchange.portfolio.adjust(BOB, 'Meridian', 2500);

    const controller = controllingHolder(exchange.portfolio, listing);
    expect(controller.shares).toBe(7500);
    expect(controller.fraction).toBe(0.75);
  });

  test('should let a corporation control another company', () => {
    const { exchange, listing } = setup();
    exchange.portfolio.adjust(ACME, 'Meridian', 9000);

    // Personal and corporate holdings share one register, so a takeover is a
    // matter of who accumulates enough rather than of who they are
    expect(controllingHolder(exchange.portfolio, listing).holder).toEqual(ACME);
  });

  test('should report nobody when nothing is outstanding', () => {
    const { exchange, listing } = setup(0);
    exchange.portfolio.adjust(ALICE, 'Meridian', 100);

    expect(controllingHolder(exchange.portfolio, listing)).toBeNull();
  });

  test('should expose the threshold it uses', () => {
    expect(CONTROL_THRESHOLD).toBe(0.5);
  });
});

describe('controls', () => {
  test('should confirm the majority holder and deny everyone else', () => {
    const { exchange, listing } = setup();
    exchange.portfolio.adjust(ALICE, 'Meridian', 6000);
    exchange.portfolio.adjust(BOB, 'Meridian', 4000);

    expect(controls(exchange.portfolio, listing, ALICE)).toBe(true);
    expect(controls(exchange.portfolio, listing, BOB)).toBe(false);
  });
});

describe('detectControlChanges', () => {
  test('should report nothing when nobody has control', () => {
    const { exchange } = setup();
    expect(detectControlChanges(exchange)).toEqual([]);
  });

  test('should report a change once, not every cycle', () => {
    const { exchange } = setup();
    exchange.portfolio.adjust(ALICE, 'Meridian', 6000);

    const first = detectControlChanges(exchange);
    expect(first).toHaveLength(1);
    expect(first[0].to).toEqual(ALICE);

    // Control persisting is not news a second time
    expect(detectControlChanges(exchange)).toEqual([]);
  });

  test('should report control passing between holders', () => {
    const { exchange } = setup();
    exchange.portfolio.adjust(ALICE, 'Meridian', 6000);
    detectControlChanges(exchange);

    exchange.portfolio.adjust(ALICE, 'Meridian', -5000);
    exchange.portfolio.adjust(BOB, 'Meridian', 6000);

    const changes = detectControlChanges(exchange);
    expect(changes).toHaveLength(1);
    expect(changes[0].from).toEqual(ALICE);
    expect(changes[0].to).toEqual(BOB);
  });

  test('should report control being lost', () => {
    const { exchange } = setup();
    exchange.portfolio.adjust(ALICE, 'Meridian', 6000);
    detectControlChanges(exchange);

    exchange.portfolio.adjust(ALICE, 'Meridian', -3000);

    const changes = detectControlChanges(exchange);
    expect(changes).toHaveLength(1);
    expect(changes[0].to).toBeNull();
  });

  test('should survive a save and load without re-reporting', () => {
    const economy = new EconomyState({ seed: 'persist' });
    const exchange = economy.getExchange();
    exchange.listCompany({
      corporationName: 'Meridian', referencePrice: 50, sharesOutstanding: 10000
    });
    exchange.portfolio.adjust(ALICE, 'Meridian', 6000);
    detectControlChanges(exchange);

    const restored = EconomyState.fromJSON(JSON.parse(JSON.stringify(economy.toJSON())));

    expect(restored.getExchange().getListing('Meridian').controllerKey)
      .toBe(holderKey(ALICE));
    expect(detectControlChanges(restored.getExchange())).toEqual([]);
  });
});

describe('control through a running game', () => {
  test('should announce a takeover on the event bus and in the news', () => {
    const game = new Game(createUniverse(8, 12, 25), settings, { seed: 'takeover' });
    game.initializeGame({
      name: 'Trader',
      pronouns: { subject: 'they', object: 'them', possessive: 'their', reflexive: 'themself' },
      description: 'Control test player',
      corporation: { name: 'PlayerCo', description: 'The player corporation' }
    });

    const target = game.getCorporations().find(corporation => !corporation.isPlayerOwned);
    game.listCorporation(target.name, 10000);

    // A decisive stake, however it was come by
    game.getEconomy().getExchange().portfolio
      .adjust(playerHolder(game.getPlayer()), target.name, 6000);

    const listener = jest.fn();
    game.getEventBus().on('control-changed', listener);
    game.advanceTicks(ticksPerDay(settings), 'test');

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ corporationName: target.name })
    );
    expect(game.getEconomy().getNews().items.some(
      item => item.kind === 'control_changed'
    )).toBe(true);
  });
});
