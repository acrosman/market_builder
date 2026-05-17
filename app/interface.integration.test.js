/**
 * Integration tests for interface.js
 * Loads the actual module and fires DOMContentLoaded to cover all code paths.
 */

describe('interface.js (integration)', () => {
  let mockApi;

  beforeEach(() => {
    document.body.innerHTML = `
      <button id="new-game-btn">New Game</button>
      <button id="load-game-btn">Load Game</button>
    `;

    mockApi = {
      send: jest.fn(),
      invoke: jest.fn()
    };
    window.api = mockApi;

    jest.isolateModules(() => {
      require('./interface');
    });

    document.dispatchEvent(new Event('DOMContentLoaded'));
  });

  afterEach(() => {
    document.body.innerHTML = '';
    delete window.api;
  });

  test('clicking new-game-btn sends open-new-game', () => {
    document.getElementById('new-game-btn').click();
    expect(mockApi.send).toHaveBeenCalledWith('open-new-game');
  });

  test('clicking load-game-btn with successful result sends load-game', async () => {
    mockApi.invoke.mockResolvedValue({ success: true, filePath: '/saves/game.json' });
    document.getElementById('load-game-btn').click();
    await new Promise(r => setTimeout(r, 0));
    expect(mockApi.invoke).toHaveBeenCalledWith('open-load-game-dialog');
    expect(mockApi.send).toHaveBeenCalledWith('load-game', '/saves/game.json');
  });

  test('clicking load-game-btn with no filePath does not send load-game', async () => {
    mockApi.invoke.mockResolvedValue({ success: true, filePath: null });
    document.getElementById('load-game-btn').click();
    await new Promise(r => setTimeout(r, 0));
    expect(mockApi.send).not.toHaveBeenCalledWith('load-game', expect.anything());
  });

  test('clicking load-game-btn with failed result does not send load-game', async () => {
    mockApi.invoke.mockResolvedValue({ success: false });
    document.getElementById('load-game-btn').click();
    await new Promise(r => setTimeout(r, 0));
    expect(mockApi.send).not.toHaveBeenCalledWith('load-game', expect.anything());
  });

  test('clicking load-game-btn handles invoke rejection gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const alertSpy = jest.spyOn(global, 'alert').mockImplementation(() => {});
    mockApi.invoke.mockRejectedValue(new Error('dialog error'));
    document.getElementById('load-game-btn').click();
    await new Promise(r => setTimeout(r, 0));
    expect(consoleSpy).toHaveBeenCalledWith('Error opening load game dialog:', expect.any(Error));
    expect(alertSpy).toHaveBeenCalledWith('Error opening file dialog');
    consoleSpy.mockRestore();
    alertSpy.mockRestore();
  });
});
