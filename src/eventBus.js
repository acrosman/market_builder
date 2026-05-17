/**
 * Event Bus for managing game events
 * Allows services to subscribe to and emit events throughout the game
 *
 * Subscriber Interface:
 * Objects can implement specific event handler methods to receive events.
 * The EventBus will call these methods when events are emitted.
 *
 * Example subscriber:
 * {
 *   onTick(data) { ... },
 *   onGameEnd(data) { ... }
 * }
 */
const { createLogger } = require('./logger');
const logger = createLogger('EventBus');

class EventBus {
  constructor() {
    this.listeners = new Map();
    this.subscribers = new Map(); // Map of eventName -> Set of subscriber objects
  }

  /**
   * Subscribe to an event
   * @param {string} eventName - Name of the event to listen for
   * @param {Function} callback - Function to call when event is emitted
   * @returns {Function} Unsubscribe function
   */
  on(eventName, callback) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, []);
    }

    this.listeners.get(eventName).push(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(eventName);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
      }
    };
  }

  /**
   * Subscribe an object to receive events via method calls
   * The subscriber object should implement methods matching event names
   * Example: For 'tick' events, implement onTick(data) method
   *
   * @param {string} eventName - Name of the event to subscribe to
   * @param {Object} subscriber - Object with event handler method
   * @returns {Function} Unsubscribe function
   *
   * @example
   * const obj = {
   *   onTick(data) { console.log('Tick received:', data); }
   * };
   * const unsubscribe = eventBus.subscribe('tick', obj);
   */
  subscribe(eventName, subscriber) {
    if (!subscriber || typeof subscriber !== 'object') {
      throw new Error('Subscriber must be an object');
    }

    // Construct the expected method name (e.g., 'tick' -> 'onTick')
    const methodName = 'on' + eventName.charAt(0).toUpperCase() + eventName.slice(1);

    if (typeof subscriber[methodName] !== 'function') {
      throw new Error(`Subscriber must implement ${methodName}() method for '${eventName}' events`);
    }

    if (!this.subscribers.has(eventName)) {
      this.subscribers.set(eventName, new Set());
    }

    this.subscribers.get(eventName).add(subscriber);

    // Return unsubscribe function
    return () => {
      const subs = this.subscribers.get(eventName);
      if (subs) {
        subs.delete(subscriber);
      }
    };
  }

  /**
   * Unsubscribe an object from receiving events
   * @param {string} eventName - Name of the event to unsubscribe from
   * @param {Object} subscriber - Subscriber object to remove
   */
  unsubscribe(eventName, subscriber) {
    const subs = this.subscribers.get(eventName);
    if (subs) {
      subs.delete(subscriber);
    }
  }

  /**
   * Subscribe to an event for only one emission
   * @param {string} eventName - Name of the event to listen for
   * @param {Function} callback - Function to call when event is emitted
   * @returns {Function} Unsubscribe function
   */
  once(eventName, callback) {
    const unsubscribe = this.on(eventName, (...args) => {
      unsubscribe();
      callback(...args);
    });
    return unsubscribe;
  }

  /**
   * Emit an event to all subscribers
   * @param {string} eventName - Name of the event to emit
   * @param {*} data - Data to pass to event listeners
   */
  emit(eventName, data) {
    // Call function-based listeners
    const callbacks = this.listeners.get(eventName);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          logger.error(`Error in event listener for ${eventName}:`, error);
        }
      });
    }

    // Call subscriber object methods
    const subs = this.subscribers.get(eventName);
    if (subs) {
      const methodName = 'on' + eventName.charAt(0).toUpperCase() + eventName.slice(1);
      subs.forEach(subscriber => {
        try {
          subscriber[methodName](data);
        } catch (error) {
          logger.error(`Error in subscriber method ${methodName} for ${eventName}:`, error);
        }
      });
    }
  }

  /**
   * Remove all listeners for an event, or all events if no event name specified
   * @param {string} [eventName] - Optional event name to clear listeners for
   */
  clear(eventName) {
    if (eventName) {
      this.listeners.delete(eventName);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Get the number of listeners for an event
   * @param {string} eventName - Name of the event
   * @returns {number} Number of listeners
   */
  listenerCount(eventName) {
    const callbacks = this.listeners.get(eventName);
    return callbacks ? callbacks.length : 0;
  }
}

module.exports = { EventBus };
