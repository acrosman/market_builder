const { isAgent, ACTION_KINDS } = require('./agentInterface');
const { AGENTS, DEFAULT_AGENT_NAME, agentFor, agentNames } = require('./index');
const marketAgent = require('./marketAgent');
const militaryAgent = require('./militaryAgent');

describe('the agent interface', () => {
  test('should accept every registered agent', () => {
    AGENTS.forEach(agent => {
      expect(isAgent(agent)).toBe(true);
    });
  });

  test('should reject an object missing part of the contract', () => {
    expect(isAgent(null)).toBe(false);
    expect(isAgent({})).toBe(false);
    expect(isAgent({ name: 'x', descriptionKey: 'k' })).toBe(false);
    expect(isAgent({ name: '', descriptionKey: 'k', act: () => [] })).toBe(false);
    expect(isAgent({ name: 'x', act: () => [] })).toBe(false);
  });

  test('should name every action kind an agent may report', () => {
    expect(ACTION_KINDS).toContain('build');
    expect(ACTION_KINDS).toContain('acquisition_bid');
  });

  test('should describe every agent through a message key, never literal text', () => {
    AGENTS.forEach(agent => {
      expect(agent.descriptionKey).toMatch(/^npc_corporations\.agents\./);
    });
  });
});

describe('the agent registry', () => {
  test('should list the agents in registration order', () => {
    expect(agentNames()).toEqual(['market', 'military']);
  });

  test('should look an agent up by name', () => {
    expect(agentFor('military')).toBe(militaryAgent);
    expect(agentFor('market')).toBe(marketAgent);
  });

  test('should fall back to the default rather than fail an old save', () => {
    // A name that no longer exists must load as an ordinary company rather
    // than throwing partway through restoring a game.
    expect(agentFor('no-such-agent').name).toBe(DEFAULT_AGENT_NAME);
    expect(agentFor(null).name).toBe(DEFAULT_AGENT_NAME);
    expect(agentFor(undefined).name).toBe(DEFAULT_AGENT_NAME);
  });
});

describe('the military agent', () => {
  test('should do nothing until invasion mechanics exist', () => {
    expect(militaryAgent.act({})).toEqual([]);
  });
});
