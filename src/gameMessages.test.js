const fs = require('fs');

describe('gameMessages', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
  });

  test('caches parsed game messages by file path', () => {
    const readFileSpy = jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({
      navigation: {
        jumping: 'Jumping to System {systemId}...'
      }
    }));
    const { getGameMessages } = require('./gameMessages');

    expect(getGameMessages('data/default/en-us', 'navigation.jumping')).toBe('Jumping to System {systemId}...');
    expect(getGameMessages('data/default/en-us', 'navigation.jumping')).toBe('Jumping to System {systemId}...');
    expect(readFileSpy).toHaveBeenCalledTimes(1);
  });

  test('preserves empty localized strings instead of using the fallback', () => {
    jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({
      construction: {
        reasons: {
          blank: ''
        }
      }
    }));
    const { getLocalizedGameMessage } = require('./gameMessages');

    expect(
      getLocalizedGameMessage('data/default/en-us', 'construction.reasons.blank', {}, 'fallback')
    ).toBe('');
  });
});
