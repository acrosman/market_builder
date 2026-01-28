const { NPC } = require('./npc');

describe('NPC Class', () => {
  test('initializes with correct values', () => {
    const npc = new NPC(1, 'trader', 2);

    expect(npc.id).toBe(1);
    expect(npc.type).toBe('trader');
    expect(npc.homeSystem).toBe(2);
    expect(npc.currentSystem).toBe(2);
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
  });
});
