const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

jest.mock('./logger', () => ({
  createLogger: jest.fn(() => mockLogger)
}));

const { EventBus } = require('./eventBus');

describe('EventBus', () => {
  let eventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    mockLogger.debug.mockClear();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();
  });

  describe('on() and emit()', () => {
    test('should call listener when event is emitted', () => {
      const listener = jest.fn();
      eventBus.on('test-event', listener);

      eventBus.emit('test-event', { data: 'test' });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({ data: 'test' });
    });

    test('should call multiple listeners for the same event', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      eventBus.on('test-event', listener1);
      eventBus.on('test-event', listener2);

      eventBus.emit('test-event', 'data');

      expect(listener1).toHaveBeenCalledWith('data');
      expect(listener2).toHaveBeenCalledWith('data');
    });

    test('should not call listener for different event', () => {
      const listener = jest.fn();
      eventBus.on('event-a', listener);

      eventBus.emit('event-b', 'data');

      expect(listener).not.toHaveBeenCalled();
    });

    test('should handle emit when no listeners exist', () => {
      expect(() => {
        eventBus.emit('no-listeners', 'data');
      }).not.toThrow();
    });

    test('should continue calling other listeners if one throws error', () => {
      const listener1 = jest.fn(() => {
        throw new Error('Test error');
      });
      const listener2 = jest.fn();

      eventBus.on('test-event', listener1);
      eventBus.on('test-event', listener2);

      eventBus.emit('test-event', 'data');

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('once()', () => {
    test('should call listener only once', () => {
      const listener = jest.fn();
      eventBus.once('test-event', listener);

      eventBus.emit('test-event', 'data1');
      eventBus.emit('test-event', 'data2');

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith('data1');
    });
  });

  describe('unsubscribe', () => {
    test('should stop calling listener after unsubscribe', () => {
      const listener = jest.fn();
      const unsubscribe = eventBus.on('test-event', listener);

      eventBus.emit('test-event', 'data1');
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();

      eventBus.emit('test-event', 'data2');
      expect(listener).toHaveBeenCalledTimes(1); // Still 1, not called again
    });

    test('should not affect other listeners when one unsubscribes', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      const unsubscribe1 = eventBus.on('test-event', listener1);
      eventBus.on('test-event', listener2);

      unsubscribe1();

      eventBus.emit('test-event', 'data');

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalledWith('data');
    });
  });

  describe('clear()', () => {
    test('should remove all listeners for specific event', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      eventBus.on('event-a', listener1);
      eventBus.on('event-b', listener2);

      eventBus.clear('event-a');

      eventBus.emit('event-a', 'data');
      eventBus.emit('event-b', 'data');

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    test('should remove all listeners for all events when no event specified', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      eventBus.on('event-a', listener1);
      eventBus.on('event-b', listener2);

      eventBus.clear();

      eventBus.emit('event-a', 'data');
      eventBus.emit('event-b', 'data');

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
    });
  });

  describe('listenerCount()', () => {
    test('should return correct number of listeners', () => {
      expect(eventBus.listenerCount('test-event')).toBe(0);

      eventBus.on('test-event', jest.fn());
      expect(eventBus.listenerCount('test-event')).toBe(1);

      eventBus.on('test-event', jest.fn());
      expect(eventBus.listenerCount('test-event')).toBe(2);
    });

    test('should return 0 for event with no listeners', () => {
      expect(eventBus.listenerCount('non-existent')).toBe(0);
    });
  });

  describe('subscribe()', () => {
    test('should throw when subscriber is not an object', () => {
      expect(() => eventBus.subscribe('tick', null)).toThrow('Subscriber must be an object');
      expect(() => eventBus.subscribe('tick', 'string')).toThrow('Subscriber must be an object');
    });

    test('should throw when subscriber does not implement required method', () => {
      const badSubscriber = {};
      expect(() => eventBus.subscribe('tick', badSubscriber)).toThrow(
        "Subscriber must implement onTick() method for 'tick' events"
      );
    });

    test('should call subscriber method when event is emitted', () => {
      const subscriber = { onTick: jest.fn() };
      eventBus.subscribe('tick', subscriber);

      eventBus.emit('tick', { ticks: 1 });

      expect(subscriber.onTick).toHaveBeenCalledWith({ ticks: 1 });
    });

    test('returned unsubscribe function removes the subscriber', () => {
      const subscriber = { onTick: jest.fn() };
      const unsubscribe = eventBus.subscribe('tick', subscriber);

      unsubscribe();
      eventBus.emit('tick', { ticks: 1 });

      expect(subscriber.onTick).not.toHaveBeenCalled();
    });

    test('should log error when subscriber method throws', () => {
      const subscriber = {
        onTick: jest.fn(() => { throw new Error('subscriber error'); })
      };

      eventBus.subscribe('tick', subscriber);
      eventBus.emit('tick', { ticks: 1 });

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('unsubscribe()', () => {
    test('should remove a subscriber', () => {
      const subscriber = { onTick: jest.fn() };
      eventBus.subscribe('tick', subscriber);

      eventBus.unsubscribe('tick', subscriber);
      eventBus.emit('tick', { ticks: 1 });

      expect(subscriber.onTick).not.toHaveBeenCalled();
    });

    test('should not throw when event has no subscribers', () => {
      const subscriber = { onTick: jest.fn() };
      expect(() => eventBus.unsubscribe('tick', subscriber)).not.toThrow();
    });
  });
});
