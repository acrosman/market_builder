/**
 * The contract every NPC corporation agent implements.
 *
 * An agent is a strategy: it decides what one corporation does with a turn.
 * Corporations differ by the agent driving them rather than by branches inside
 * one decision function, so a new kind of rival is a new module here rather
 * than another condition in a growing `if`.
 *
 * The game only ever calls `act()`. Everything an agent needs to decide with
 * arrives in the context, and everything it did comes back in the result, so
 * the caller can report it as news without knowing which agent produced it.
 *
 * ## Implementing an agent
 *
 * ```javascript
 * module.exports = {
 *   name: 'market',
 *   descriptionKey: 'npc_corporations.agents.market',
 *   act({ game, corporation, tick, days }) {
 *     return [{ kind: 'build', ... }];
 *   }
 * };
 * ```
 *
 * - **`name`** is stored on the corporation and persists across a save, so
 *   renaming one changes how existing saves load. Treat it as an identifier.
 * - **`descriptionKey`** is a `game_messages.json` path. Agents never return
 *   user-facing text.
 * - **`act()`** returns an array of action records. An agent that decides to do
 *   nothing returns an empty array; it does not throw and does not report.
 *
 * ## Action records
 *
 * Each carries a `kind` naming what happened and whatever else that kind of
 * action needs. `corporationName` is added by the caller, so an agent does not
 * have to remember to set it.
 */

/** Every action kind an agent can report. */
const ACTION_KINDS = Object.freeze([
  'build',
  'acquisition_bid'
]);

/**
 * Check that an object satisfies the agent contract.
 *
 * Used when agents are registered rather than when they run, so a malformed
 * agent fails at startup with a clear message instead of midway through a
 * simulated year.
 * @param {Object} agent - Candidate agent.
 * @returns {boolean} True when the object can be registered as an agent.
 * @example
 * isAgent(require('./marketAgent')); // => true
 */
function isAgent(agent) {
  return Boolean(agent)
    && typeof agent.name === 'string'
    && agent.name.length > 0
    && typeof agent.descriptionKey === 'string'
    && typeof agent.act === 'function';
}

module.exports = {
  ACTION_KINDS,
  isAgent
};
