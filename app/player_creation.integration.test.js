/**
 * Integration tests for player_creation.js
 * Loads the actual module and exercises all code paths.
 */

describe('player_creation.js (integration)', () => {
  let mockApi;
  const mockSettings = {
    pronoun_options: [
      { subject: 'he', object: 'him', possessive: 'his' },
      { subject: 'she', object: 'her', possessive: 'her' },
      { subject: 'they', object: 'them', possessive: 'their' }
    ]
  };

  beforeEach(async () => {
    document.body.innerHTML = `
      <form id="player-form">
        <input type="text" name="playerName" value="Test Captain" />
        <select name="pronouns"></select>
        <textarea name="description">A brave captain.</textarea>
        <input type="text" name="corporationName" value="Test Corp" />
        <textarea name="corporationDescription">A test corporation.</textarea>
        <button type="submit">Create Player</button>
      </form>
      <button id="back-btn">Back</button>
    `;

    mockApi = {
      send: jest.fn(),
      receive: jest.fn(),
      getGameSettings: jest.fn().mockResolvedValue(mockSettings)
    };
    window.api = mockApi;

    jest.isolateModules(() => {
      require('./player_creation');
    });

    document.dispatchEvent(new Event('DOMContentLoaded'));
    // Wait for the async DOMContentLoaded handler (getGameSettings + pronoun population)
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));
  });

  afterEach(() => {
    document.body.innerHTML = '';
    delete window.api;
  });

  test('populates pronoun options from settings', () => {
    const pronounSelect = document.querySelector('select[name="pronouns"]');
    expect(pronounSelect.options.length).toBe(3);
    expect(pronounSelect.options[0].textContent).toBe('he/him/his');
    expect(pronounSelect.options[1].textContent).toBe('she/her/her');
    expect(pronounSelect.options[2].textContent).toBe('they/them/their');
  });

  test('submitting the form sends create-player with player data', () => {
    const pronounSelect = document.querySelector('select[name="pronouns"]');
    pronounSelect.value = '1'; // she/her/her

    document.getElementById('player-form').dispatchEvent(new Event('submit'));

    expect(mockApi.send).toHaveBeenCalledWith('create-player', {
      name: 'Test Captain',
      pronouns: mockSettings.pronoun_options[1],
      description: 'A brave captain.',
      corporation: {
        name: 'Test Corp',
        description: 'A test corporation.'
      }
    });
  });

  test('clicking back-btn sends return-to-universe-creation', () => {
    document.getElementById('back-btn').click();
    expect(mockApi.send).toHaveBeenCalledWith('return-to-universe-creation');
  });

  test('receive is called for player-creation-error channel', () => {
    expect(mockApi.receive).toHaveBeenCalledWith('player-creation-error', expect.any(Function));
  });

  test('receive is called for player-creation-success channel', () => {
    expect(mockApi.receive).toHaveBeenCalledWith('player-creation-success', expect.any(Function));
  });

  test('player-creation-error callback calls alert with error message', () => {
    const alertSpy = jest.spyOn(global, 'alert').mockImplementation(() => {});
    const errorCallback = mockApi.receive.mock.calls.find(c => c[0] === 'player-creation-error')[1];
    errorCallback({ message: 'Invalid name' });
    expect(alertSpy).toHaveBeenCalledWith('Invalid name');
    alertSpy.mockRestore();
  });
});
