const { Player } = require('./player');

describe('Player Class', () => {
  let mockSettings;

  beforeEach(() => {
    mockSettings = {
      initial_ship: 'Cargo Hauler',
      starting_credits: 1000,
      data_directory: 'data/default/en-us'
    };
  });

  test('initializes with correct default values', () => {
    const player = new Player('TestPlayer', mockSettings);

    expect(player.name).toBe('TestPlayer');
    expect(player.credits).toBe(mockSettings.starting_credits);
    expect(player.location).toBe(1);
    expect(player.ship).toBe(mockSettings.initial_ship);
    expect(player.cargo).toEqual({});
    expect(player.stats).toEqual({
      jumps: 0,
      trades: 0,
      profit: 0
    });
  });

  test('initializes with ship-specific properties', () => {
    const player = new Player('TestPlayer', mockSettings);

    expect(player.shipEnergy).toBeGreaterThan(0);
    expect(player.shipMaxEnergy).toBeGreaterThan(0);
    expect(player.energyPerJump).toBeGreaterThan(0);
    expect(player.energyRecharge).toBeGreaterThan(0);
    expect(player.shipEnergy).toBe(player.shipMaxEnergy);
  });

  test('initializes with null docked and landed states', () => {
    const player = new Player('TestPlayer', mockSettings);

    expect(player.dockedAt).toBeNull();
    expect(player.landedOn).toBeNull();
  });

  test('inherits Trader functionality', () => {
    const player = new Player('TestPlayer', mockSettings);

    // Test inherited methods
    expect(player.canAfford(500)).toBe(true);
    expect(player.canAfford(2000)).toBe(false);

    player.addCargo('Iron', 10);
    expect(player.getCargoQuantity('Iron')).toBe(10);

    const removed = player.removeCargo('Iron', 5);
    expect(removed).toBe(true);
    expect(player.getCargoQuantity('Iron')).toBe(5);

    player.moveTo(3);
    expect(player.location).toBe(3);
  });
});
