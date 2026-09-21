const fs = require('fs');
const path = require('path');
const { Game } = require('../game');
const { createUniverse } = require('../universe');
const { loadContent } = require('../contentCache');

const settings = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'data/default/en-us/game_settings.json'), 'utf-8')
);

/**
 * Build a started game with enough objects to guarantee asteroids appear.
 * @returns {Object} An initialized Game.
 */
function startedGame() {
  const game = new Game(createUniverse(10, 14, 60), settings, { seed: 'asteroid' });
  game.initializeGame({
    name: 'Prospector',
    pronouns: { subject: 'they', object: 'them', possessive: 'their', reflexive: 'themself' },
    description: 'Asteroid test player',
    corporation: { name: 'Belt Mining', description: 'A mining corporation' }
  });
  return game;
}

/**
 * Find an asteroid in a game's universe.
 * @param {Object} game - The game to search.
 * @returns {Object} An asteroid.
 */
function findAsteroid(game) {
  const asteroid = game.getUniverse().stellarObjects.find(obj => obj.type === 'Asteroid');
  expect(asteroid).toBeDefined();
  return asteroid;
}

describe('asteroid markets', () => {
  test('should declare market capability in the content data', () => {
    expect(loadContent('stellarObjects').Asteroid.market).toBe(true);
  });

  test('should give asteroids a market state', () => {
    const asteroid = findAsteroid(startedGame());
    expect(asteroid.capabilities.market).toBe(true);
    expect(asteroid.marketState).not.toBeNull();
    expect(asteroid.marketState.inventory).toBeDefined();
  });

  test('should stock an asteroid market at generation', () => {
    const asteroid = findAsteroid(startedGame());
    const stocked = Object.values(asteroid.marketState.inventory)
      .filter(quantity => quantity > 0);
    expect(stocked.length).toBeGreaterThan(0);
  });

  test('should price goods at an asteroid market', () => {
    const game = startedGame();
    const asteroid = findAsteroid(game);
    const goodName = Object.keys(asteroid.marketState.inventory)
      .find(name => asteroid.marketState.inventory[name] > 0);

    expect(game.calculateMarketPrice(asteroid, goodName, 'buy')).toBeGreaterThan(0);
  });

  test('should let an asteroid hold the output of its own mine', () => {
    const game = startedGame();
    const asteroid = findAsteroid(game);
    asteroid.buildings = { Mine: { count: 1 } };

    const before = Number(asteroid.marketState.inventory.metalOre) || 0;
    game.advanceTicks(24 * 30, 'test');

    // Previously asteroids had buildings but no market, so a mine on one
    // produced nothing because there was nowhere to put the output
    expect(Number(asteroid.marketState.inventory.metalOre)).toBeGreaterThan(before);
  });

  test('should allow trading with an asteroid market', () => {
    const game = startedGame();
    const asteroid = findAsteroid(game);

    game.getPlayer().location = asteroid.location;
    game.getPlayer().landedOn = asteroid.id;

    const goodName = Object.keys(asteroid.marketState.inventory)
      .find(name => asteroid.marketState.inventory[name] >= 2);
    expect(goodName).toBeDefined();

    const result = game.buyGood(asteroid.id, goodName, 1);
    expect(result.success).toBe(true);
    expect(game.getPlayer().getCargoQuantity(goodName)).toBe(1);
  });

  test('should include asteroid market value in the object valuation', () => {
    const asteroid = findAsteroid(startedGame());
    // calculateValue credits an object for having a market
    expect(asteroid.value).toBeGreaterThan(0);
  });
});
