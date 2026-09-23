const { isAgent } = require('./agentInterface');
const marketAgent = require('./marketAgent');
const militaryAgent = require('./militaryAgent');

/**
 * The registry of NPC corporation strategies.
 *
 * A corporation stores its agent's `name`, so this is the lookup from a saved
 * game back to the behaviour that drove it. Adding a strategy means adding a
 * module and listing it here.
 */

/** Every registered agent, validated at load. */
const AGENTS = [marketAgent, militaryAgent];

AGENTS.forEach(agent => {
  if (!isAgent(agent)) {
    throw new TypeError(`Invalid NPC agent registered: ${agent?.name || 'unnamed'}`);
  }
});

/** The agent used when none is recorded, including for saves written before agents existed. */
const DEFAULT_AGENT_NAME = marketAgent.name;

/**
 * Look up an agent by name.
 *
 * Falls back to the default rather than throwing, so an unknown name in an old
 * save loads as an ordinary company instead of failing the load.
 * @param {string} name - Agent name stored on the corporation.
 * @returns {Object} The agent.
 * @example
 * agentFor('military').act({ game, corporation, tick });
 */
function agentFor(name) {
  return AGENTS.find(agent => agent.name === name)
    || AGENTS.find(agent => agent.name === DEFAULT_AGENT_NAME);
}

/**
 * Every agent name, in registration order.
 * @returns {Array<string>} Agent names.
 * @example
 * agentNames(); // => ['market', 'military']
 */
function agentNames() {
  return AGENTS.map(agent => agent.name);
}

module.exports = {
  AGENTS,
  DEFAULT_AGENT_NAME,
  agentFor,
  agentNames
};
