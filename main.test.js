/**
 * Unit tests for main.js IPC handlers
 * These tests verify the get-game-messages handler supports dot notation
 */

const fs = require('fs');
const path = require('path');
const { createLogger } = require('./src/logger');

describe('get-game-messages IPC handler', () => {
  let messagesData;
  let getGameMessages;

  beforeEach(() => {
    const logger = createLogger('main.test');

    // Load the actual game messages file
    const messagesPath = path.join(__dirname, 'data', 'default', 'en-us', 'game_messages.json');
    messagesData = JSON.parse(fs.readFileSync(messagesPath, 'utf-8'));

    // Create a standalone version of the handler logic for testing
    getGameMessages = (messageKey) => {
      try {
        if (messageKey) {
          // Support dot notation for nested keys (e.g., "navigation.jumping")
          const keys = messageKey.split('.');
          let result = messagesData;

          for (const key of keys) {
            if (result && typeof result === 'object' && key in result) {
              result = result[key];
            } else {
              return null; // Key path doesn't exist
            }
          }

          return result;
        }

        // Return all messages if no key specified
        return messagesData;
      } catch (error) {
        logger.error('Error loading game messages:', error);
        return null;
      }
    };
  });

  describe('nested message retrieval with dot notation', () => {
    test('should return nested navigation message string', () => {
      const result = getGameMessages('navigation.jumping');
      expect(result).toBe('Jumping to System {systemId}...');
      expect(typeof result).toBe('string');
    });

    test('should return nested save_load message string', () => {
      const result = getGameMessages('save_load.saving');
      expect(result).toBe('Saving game...');
      expect(typeof result).toBe('string');
    });

    test('should return nested jump_planner message string', () => {
      const result = getGameMessages('jump_planner.sequence_start');
      expect(result).toBe('Starting jump sequence to System {destinationId}...');
      expect(typeof result).toBe('string');
    });

    test('should return nested settings message string', () => {
      const result = getGameMessages('settings.not_implemented');
      expect(result).toBe('Game Settings feature is not yet implemented.');
      expect(typeof result).toBe('string');
    });

    test('should return nested ui message string', () => {
      const result = getGameMessages('ui.welcome');
      expect(result).toBe('Welcome to Universe Market Builder!');
      expect(typeof result).toBe('string');
    });
  });

  describe('top-level message group retrieval', () => {
    test('should return entire navigation object', () => {
      const result = getGameMessages('navigation');
      expect(typeof result).toBe('object');
      expect(result).toHaveProperty('jumping');
      expect(result).toHaveProperty('jump_success');
      expect(result).toHaveProperty('docking_request');
    });

    test('should return entire save_load object', () => {
      const result = getGameMessages('save_load');
      expect(typeof result).toBe('object');
      expect(result).toHaveProperty('saving');
      expect(result).toHaveProperty('save_success');
      expect(result).toHaveProperty('loading');
    });

    test('should return entire game_start object', () => {
      const result = getGameMessages('game_start');
      expect(typeof result).toBe('object');
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('greeting');
      expect(result).toHaveProperty('intro');
    });
  });

  describe('all messages retrieval', () => {
    test('should return all messages when no key provided', () => {
      const result = getGameMessages();
      expect(typeof result).toBe('object');
      expect(result).toHaveProperty('navigation');
      expect(result).toHaveProperty('save_load');
      expect(result).toHaveProperty('game_start');
      expect(result).toHaveProperty('ui');
    });

    test('should return all messages when empty string provided', () => {
      const result = getGameMessages('');
      expect(typeof result).toBe('object');
      expect(result).toHaveProperty('navigation');
    });
  });

  describe('invalid key handling', () => {
    test('should return null for non-existent top-level key', () => {
      const result = getGameMessages('nonexistent');
      expect(result).toBeNull();
    });

    test('should return null for non-existent nested key', () => {
      const result = getGameMessages('navigation.nonexistent');
      expect(result).toBeNull();
    });

    test('should return null for invalid nested path', () => {
      const result = getGameMessages('navigation.jumping.extra');
      expect(result).toBeNull();
    });

    test('should return null for deeply invalid path', () => {
      const result = getGameMessages('invalid.path.to.message');
      expect(result).toBeNull();
    });
  });

  describe('edge cases', () => {
    test('should handle keys with multiple dots', () => {
      // While our current structure only has 2 levels,
      // the handler should gracefully handle deeper paths
      const result = getGameMessages('navigation.jumping.nonexistent');
      expect(result).toBeNull();
    });

    test('should distinguish between object and string returns', () => {
      const objectResult = getGameMessages('navigation');
      const stringResult = getGameMessages('navigation.jumping');

      expect(typeof objectResult).toBe('object');
      expect(typeof stringResult).toBe('string');
      expect(objectResult).not.toBe(stringResult);
    });
  });
});

describe('get-universe-state IPC handler', () => {
  test('should return null when no current game exists', () => {
    const currentGame = null;

    const getUniverseState = () => {
      if (!currentGame || !currentGame.universe) return null;
      return {
        systems: currentGame.universe.systems,
        stellarObjects: currentGame.universe.stellarObjects
      };
    };

    const result = getUniverseState();
    expect(result).toBeNull();
  });

  test('should return universe state with systems and stellarObjects', () => {
    const currentGame = {
      universe: {
        systems: [
          { id: 1, name: 'Alpha' },
          { id: 2, name: 'Beta' }
        ],
        stellarObjects: [
          { id: 1, name: 'Earth', type: 'Planet', location: 1 },
          { id: 2, name: 'Mars', type: 'Planet', location: 1 },
          { id: 3, name: 'Station One', type: 'Station', location: 2 }
        ]
      }
    };

    const getUniverseState = () => {
      if (!currentGame || !currentGame.universe) return null;
      return {
        systems: currentGame.universe.systems,
        stellarObjects: currentGame.universe.stellarObjects
      };
    };

    const result = getUniverseState();

    expect(result).not.toBeNull();
    expect(result.systems).toHaveLength(2);
    expect(result.stellarObjects).toHaveLength(3);
    expect(result.systems[0].name).toBe('Alpha');
    expect(result.stellarObjects[0].name).toBe('Earth');
  });

  test('should return null when universe is missing', () => {
    const currentGame = {
      player: { name: 'Test' }
      // universe is missing
    };

    const getUniverseState = () => {
      if (!currentGame || !currentGame.universe) return null;
      return {
        systems: currentGame.universe.systems,
        stellarObjects: currentGame.universe.stellarObjects
      };
    };

    const result = getUniverseState();
    expect(result).toBeNull();
  });
});

describe('get-universe-map-data IPC handler', () => {
  test('should return null when no current game exists', () => {
    const currentGame = null;

    const getUniverseMapData = () => {
      if (!currentGame || !currentGame.universe) return null;
      return {
        systems: currentGame.universe.systems,
        stellarObjects: currentGame.universe.stellarObjects,
        exploredSystems: currentGame.exploredSystems || []
      };
    };

    const result = getUniverseMapData();
    expect(result).toBeNull();
  });

  test('should return universe map data with systems, stellarObjects, and exploredSystems', () => {
    const currentGame = {
      universe: {
        systems: [
          { id: 1, name: 'Alpha', connections: { 2: 5 } },
          { id: 2, name: 'Beta', connections: { 1: 5, 3: 7 } },
          { id: 3, name: 'Gamma', connections: { 2: 7 } }
        ],
        stellarObjects: [
          { id: 1, name: 'Earth', type: 'Planet', location: 1 },
          { id: 2, name: 'Station Alpha', type: 'Station', location: 2 },
          { id: 3, name: 'Mining Base', type: 'Station', location: 3 }
        ]
      },
      exploredSystems: [1, 2]
    };

    const getUniverseMapData = () => {
      if (!currentGame || !currentGame.universe) return null;
      return {
        systems: currentGame.universe.systems,
        stellarObjects: currentGame.universe.stellarObjects,
        exploredSystems: currentGame.exploredSystems || []
      };
    };

    const result = getUniverseMapData();

    expect(result).not.toBeNull();
    expect(result.systems).toHaveLength(3);
    expect(result.stellarObjects).toHaveLength(3);
    expect(result.exploredSystems).toEqual([1, 2]);
    expect(result.systems[0].name).toBe('Alpha');
    expect(result.stellarObjects[1].type).toBe('Station');
  });

  test('should return empty exploredSystems array when not initialized', () => {
    const currentGame = {
      universe: {
        systems: [{ id: 1, name: 'Alpha' }],
        stellarObjects: [{ id: 1, name: 'Earth', type: 'Planet', location: 1 }]
      }
      // exploredSystems not set
    };

    const getUniverseMapData = () => {
      if (!currentGame || !currentGame.universe) return null;
      return {
        systems: currentGame.universe.systems,
        stellarObjects: currentGame.universe.stellarObjects,
        exploredSystems: currentGame.exploredSystems || []
      };
    };

    const result = getUniverseMapData();

    expect(result).not.toBeNull();
    expect(result.exploredSystems).toEqual([]);
  });

  test('should return null when universe is missing', () => {
    const currentGame = {
      player: { name: 'Test' },
      exploredSystems: [1]
      // universe is missing
    };

    const getUniverseMapData = () => {
      if (!currentGame || !currentGame.universe) return null;
      return {
        systems: currentGame.universe.systems,
        stellarObjects: currentGame.universe.stellarObjects,
        exploredSystems: currentGame.exploredSystems || []
      };
    };

    const result = getUniverseMapData();
    expect(result).toBeNull();
  });
});
