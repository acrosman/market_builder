const { NPC } = require('./npc');

describe('NPC Class', () => {
  test('initializes with correct values', () => {
    const npc = new NPC(1, 'trader', 2);

    expect(npc.id).toBe(1);
    expect(npc.type).toBe('trader');
    expect(npc.homeSystem).toBe(2);
    expect(npc.currentSystem).toBe(2);
    expect(npc.location).toBe(2); // location should match currentSystem
    expect(npc.credits).toBe(1000);
    expect(npc.ship).toBe('Shuttle');
    expect(npc.cargo).toEqual({});
  });

  test('initializes with different id and type', () => {
    const npc = new NPC(5, 'pirate', 10);

    expect(npc.id).toBe(5);
    expect(npc.type).toBe('pirate');
    expect(npc.homeSystem).toBe(10);
    expect(npc.currentSystem).toBe(10);
    expect(npc.location).toBe(10);
  });

  test('moveTo keeps currentSystem in sync with location', () => {
    const npc = new NPC(1, 'trader', 2);

    npc.moveTo(5);

    expect(npc.location).toBe(5);
    expect(npc.currentSystem).toBe(5);
  });

  test('inherits Trader functionality', () => {
    const npc = new NPC(1, 'trader', 2);

    // Test inherited methods
    expect(npc.canAfford(500)).toBe(true);
    expect(npc.canAfford(2000)).toBe(false);

    npc.addCargo('Iron', 10);
    expect(npc.getCargoQuantity('Iron')).toBe(10);

    const removed = npc.removeCargo('Iron', 5);
    expect(removed).toBe(true);
    expect(npc.getCargoQuantity('Iron')).toBe(5);
  });
});
