const {
  normalizeCommandText,
  parseNumericSystemId,
  parseJumpSystemId,
  applyAlias,
  resolveUniqueFirstWord
} = require('./commandParser');

describe('commandParser', () => {
  test('normalizeCommandText trims, lowercases, and collapses whitespace', () => {
    expect(normalizeCommandText('  Save    Game  ')).toBe('save game');
  });

  test('parseNumericSystemId returns system id for numeric commands', () => {
    expect(parseNumericSystemId('42')).toBe(42);
    expect(parseNumericSystemId('jump 42')).toBeNull();
  });

  test('parseJumpSystemId extracts destination from jump command', () => {
    expect(parseJumpSystemId('jump 7')).toBe(7);
    expect(parseJumpSystemId('jump to 7')).toBeNull();
  });

  test('applyAlias maps shortcut commands to canonical commands', () => {
    const aliases = {
      l: 'land',
      d: 'dock',
      s: 'save game',
      j: 'jump planner'
    };

    expect(applyAlias('l', aliases)).toBe('land');
    expect(applyAlias('save game', aliases)).toBe('save game');
  });

  test('resolveUniqueFirstWord maps unique first-word commands', () => {
    const labels = [
      'Save Game',
      'Load Game',
      'Player Status',
      'Universe Map',
      'Jump To'
    ];

    expect(resolveUniqueFirstWord('save', labels)).toBe('save game');
    expect(resolveUniqueFirstWord('player', labels)).toBe('player status');
  });

  test('resolveUniqueFirstWord returns null for ambiguous first words', () => {
    const labels = [
      'Jump To',
      'Jump To System 3',
      'Save Game'
    ];

    expect(resolveUniqueFirstWord('jump', labels)).toBeNull();
  });
});
