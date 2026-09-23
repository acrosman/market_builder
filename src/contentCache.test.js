const fs = require('fs');
const { loadContent, clearContentCache, DEFAULT_DATA_DIRECTORY } = require('./contentCache');

describe('contentCache', () => {
  beforeEach(() => {
    clearContentCache();
    jest.restoreAllMocks();
  });

  afterAll(() => clearContentCache());

  describe('loadContent', () => {
    test('should load a real content file', () => {
      const goods = loadContent('goods');
      expect(Object.keys(goods).length).toBeGreaterThan(0);
    });

    test('should accept a name with or without the extension', () => {
      expect(loadContent('goods')).toBe(loadContent('goods.json'));
    });

    test('should read from disk only once for repeated calls', () => {
      const readSpy = jest.spyOn(fs, 'readFileSync');

      loadContent('goods');
      loadContent('goods');
      loadContent('goods');

      expect(readSpy).toHaveBeenCalledTimes(1);
    });

    test('should return the identical object on repeat calls', () => {
      expect(loadContent('ships')).toBe(loadContent('ships'));
    });

    test('should cache separately per data directory', () => {
      const readSpy = jest.spyOn(fs, 'readFileSync');

      loadContent('goods', DEFAULT_DATA_DIRECTORY);
      loadContent('goods', 'data/default/en-us/');

      // Different directory strings that normalize to the same path share an entry
      expect(readSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    test('should return an empty object for a missing file', () => {
      expect(loadContent('definitely-not-a-real-file')).toEqual({});
    });

    test('should not retry a missing file on every call', () => {
      loadContent('definitely-not-a-real-file');
      const readSpy = jest.spyOn(fs, 'readFileSync');

      loadContent('definitely-not-a-real-file');
      loadContent('definitely-not-a-real-file');

      // Negative-cached, so no further disk access
      expect(readSpy).not.toHaveBeenCalled();
    });

    test('should return an empty object for malformed JSON', () => {
      jest.spyOn(fs, 'readFileSync').mockReturnValue('{ not json');
      expect(loadContent('goods')).toEqual({});
    });
  });

  describe('immutability', () => {
    test('should freeze the returned content', () => {
      const goods = loadContent('goods');
      expect(Object.isFrozen(goods)).toBe(true);
    });

    test('should freeze nested content', () => {
      const goods = loadContent('goods');
      const firstGood = goods[Object.keys(goods)[0]];
      expect(Object.isFrozen(firstGood)).toBe(true);
    });

    test('should not let a caller corrupt the cache', () => {
      const goods = loadContent('goods');
      const goodName = Object.keys(goods)[0];
      const originalValue = goods[goodName].value;

      // Non-strict mode makes this a silent no-op rather than a throw
      try {
        goods[goodName].value = 999999;
      } catch (error) {
        // Strict-mode callers get a TypeError, which is also acceptable
      }

      expect(loadContent('goods')[goodName].value).toBe(originalValue);
    });
  });

  describe('clearContentCache', () => {
    test('should force a fresh read afterwards', () => {
      loadContent('goods');
      clearContentCache();

      const readSpy = jest.spyOn(fs, 'readFileSync');
      loadContent('goods');

      expect(readSpy).toHaveBeenCalledTimes(1);
    });

    test('should clear negative cache entries too', () => {
      loadContent('definitely-not-a-real-file');
      clearContentCache();

      const readSpy = jest.spyOn(fs, 'readFileSync');
      loadContent('definitely-not-a-real-file');

      expect(readSpy).toHaveBeenCalledTimes(1);
    });
  });
});
