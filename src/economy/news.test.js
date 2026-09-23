const fs = require('fs');
const path = require('path');
const { Game } = require('../game');
const { createUniverse } = require('../universe');
const { NewsStore, corporationOriginSystem } = require('./news');
const { ticksPerQuarter } = require('./clock');

const settings = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'data/default/en-us/game_settings.json'), 'utf-8')
);

describe('NewsStore', () => {
  test('should record items with an id and defaults', () => {
    const store = new NewsStore();
    const item = store.record({ tick: 24, kind: 'bankruptcy' });

    expect(item.id).toBe(1);
    expect(item.severity).toBe('routine');
    expect(item.tokens).toEqual({});
  });

  test('should record where an event happened, even when that is nowhere', () => {
    const store = new NewsStore();

    // Null rather than omitted: an event with no place is a different thing
    // from one whose place was never captured, and only the first is legitimate
    expect(store.record({ tick: 1, kind: 'x' }).originSystemId).toBeNull();
    expect(store.record({ tick: 1, kind: 'x', originSystemId: 7 }).originSystemId).toBe(7);
  });

  test('should copy tokens rather than aliasing them', () => {
    const store = new NewsStore();
    const tokens = { companyName: 'Acme' };
    const item = store.record({ tick: 1, kind: 'x', tokens });

    tokens.companyName = 'mutated';
    expect(item.tokens.companyName).toBe('Acme');
  });

  test('should keep only the most recent items', () => {
    const store = new NewsStore(3);
    for (let i = 1; i <= 6; i += 1) {
      store.record({ tick: i, kind: 'x' });
    }

    expect(store.items).toHaveLength(3);
    expect(store.items.map(item => item.tick)).toEqual([4, 5, 6]);
  });

  test('should read newest first', () => {
    const store = new NewsStore();
    [1, 2, 3].forEach(tick => store.record({ tick, kind: 'x' }));

    expect(store.recent().map(item => item.tick)).toEqual([3, 2, 1]);
  });

  test('should filter by kind and by tick', () => {
    const store = new NewsStore();
    store.record({ tick: 10, kind: 'bankruptcy' });
    store.record({ tick: 20, kind: 'dividend_paid' });
    store.record({ tick: 30, kind: 'bankruptcy' });

    expect(store.recent({ kind: 'bankruptcy' })).toHaveLength(2);
    expect(store.recent({ sinceTick: 20 })).toHaveLength(2);
  });

  test('should limit how much it returns', () => {
    const store = new NewsStore();
    for (let i = 1; i <= 20; i += 1) {
      store.record({ tick: i, kind: 'x' });
    }

    expect(store.recent({ limit: 5 })).toHaveLength(5);
  });

  describe('serialization', () => {
    test('should round trip', () => {
      const store = new NewsStore(10);
      store.record({ tick: 5, kind: 'bankruptcy', tokens: { companyName: 'Acme' } });

      const restored = NewsStore.fromJSON(JSON.parse(JSON.stringify(store.toJSON())));

      expect(restored.items).toHaveLength(1);
      expect(restored.items[0].tokens.companyName).toBe('Acme');
      expect(restored.capacity).toBe(10);
    });

    test('should continue assigning ids after a restore', () => {
      const store = new NewsStore();
      store.record({ tick: 1, kind: 'x' });

      expect(NewsStore.fromJSON(store.toJSON()).record({ tick: 2, kind: 'x' }).id).toBe(2);
    });

    test('should return a usable store from missing data', () => {
      const restored = NewsStore.fromJSON(undefined);
      expect(restored.items).toEqual([]);
      expect(restored.record({ tick: 1, kind: 'x' }).id).toBe(1);
    });
  });
});

describe('corporationOriginSystem', () => {
  /**
   * Build a started game.
   * @returns {Object} An initialized Game.
   */
  function startedGame() {
    const game = new Game(createUniverse(8, 12, 25), settings, { seed: 'news' });
    game.initializeGame({
      name: 'Trader',
      pronouns: { subject: 'they', object: 'them', possessive: 'their', reflexive: 'themself' },
      description: 'News test player',
      corporation: { name: 'PlayerCo', description: 'The player corporation' }
    });
    return game;
  }

  test('should resolve to a system a corporation holds something in', () => {
    const game = startedGame();
    const corporation = game.getCorporations()
      .find(candidate => candidate.stellarObjects.length > 0);

    const origin = corporationOriginSystem(game, corporation);
    const world = game.findStellarObject(corporation.stellarObjects[0]);

    expect(origin).toBe(world.location);
  });

  test('should be null for a corporation that holds nothing', () => {
    const game = startedGame();
    expect(corporationOriginSystem(game, { stellarObjects: [] })).toBeNull();
    expect(corporationOriginSystem(game, {})).toBeNull();
  });
});

describe('news through a running game', () => {
  /**
   * Build a game with listed companies.
   * @returns {Object} An initialized Game.
   */
  function listedGame() {
    const game = new Game(createUniverse(8, 12, 25), settings, { seed: 'news-run' });
    game.initializeGame({
      name: 'Trader',
      pronouns: { subject: 'they', object: 'them', possessive: 'their', reflexive: 'themself' },
      description: 'News test player',
      corporation: { name: 'PlayerCo', description: 'The player corporation' }
    });
    game.getCorporations()
      .filter(corporation => !corporation.isPlayerOwned)
      .slice(0, 3)
      .forEach(corporation => game.listCorporation(corporation.name, 10000));
    return game;
  }

  test('should report statements and dividends as they happen', () => {
    const game = listedGame();
    game.advanceTicks(ticksPerQuarter(settings) * 2, 'test');

    const kinds = new Set(game.getEconomy().getNews().items.map(item => item.kind));
    expect(kinds.has('statement_published')).toBe(true);
  });

  test('should tag company news with where the company operates', () => {
    const game = listedGame();
    game.advanceTicks(ticksPerQuarter(settings) * 2, 'test');

    const items = game.getEconomy().getNews().items
      .filter(item => item.kind === 'statement_published');

    expect(items.length).toBeGreaterThan(0);
    // Recorded so news can be made to travel at ship speed later without
    // every item already saved having nowhere to have come from
    expect(items.some(item => item.originSystemId !== null)).toBe(true);
  });

  test('should survive a save and load', () => {
    const game = listedGame();
    game.advanceTicks(ticksPerQuarter(settings) * 2, 'test');
    const before = game.getEconomy().getNews().items.length;
    expect(before).toBeGreaterThan(0);

    const loaded = Game.loadGame(JSON.parse(JSON.stringify(game.getSaveData())));
    expect(loaded.getEconomy().getNews().items).toHaveLength(before);
  });

  test('should stay bounded over a long run', () => {
    const game = listedGame();
    game.advanceTicks(ticksPerQuarter(settings) * 8, 'test');

    const news = game.getEconomy().getNews();
    expect(news.items.length).toBeLessThanOrEqual(news.capacity);
  });
});
