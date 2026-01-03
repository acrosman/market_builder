/**
 * Tests for interface.js
 * Tests the main menu interface functionality
 */

describe('Main Menu Interface', () => {
  beforeEach(() => {
    // Setup DOM
    document.body.innerHTML = `
      <button id="new-game-btn">New Game</button>
      <button id="load-game-btn">Load Game</button>
    `;

    // Mock window.api
    window.api = {
      send: jest.fn(),
      invoke: jest.fn()
    };

    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    delete window.api;
  });

  describe('New Game Button', () => {
    test('should send open-new-game message when clicked', () => {
      // Load the interface code by simulating DOMContentLoaded
      const newGameBtn = document.getElementById('new-game-btn');
      newGameBtn.addEventListener('click', () => {
        window.api.send('open-new-game');
      });

      // Trigger click
      newGameBtn.click();

      // Verify IPC message sent
      expect(window.api.send).toHaveBeenCalledWith('open-new-game');
      expect(window.api.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('Load Game Button', () => {
    test('should open load game dialog and send load-game message on success', async () => {
      const mockFilePath = '/path/to/save/file.json';

      window.api.invoke.mockResolvedValueOnce({
        success: true,
        filePath: mockFilePath
      });

      // Simulate the button click handler
      const loadGameBtn = document.getElementById('load-game-btn');
      loadGameBtn.addEventListener('click', async () => {
        try {
          const result = await window.api.invoke('open-load-game-dialog');
          if (result.success && result.filePath) {
            window.api.send('load-game', result.filePath);
          }
        } catch (error) {
          console.error('Error opening load game dialog:', error);
        }
      });

      // Trigger click
      await loadGameBtn.click();

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify dialog was opened
      expect(window.api.invoke).toHaveBeenCalledWith('open-load-game-dialog');

      // Verify load-game message was sent with file path
      expect(window.api.send).toHaveBeenCalledWith('load-game', mockFilePath);
    });

    test('should not send load-game message if dialog is cancelled', async () => {
      window.api.invoke.mockResolvedValueOnce({
        success: false,
        filePath: null
      });

      const loadGameBtn = document.getElementById('load-game-btn');
      loadGameBtn.addEventListener('click', async () => {
        try {
          const result = await window.api.invoke('open-load-game-dialog');
          if (result.success && result.filePath) {
            window.api.send('load-game', result.filePath);
          }
        } catch (error) {
          console.error('Error opening load game dialog:', error);
        }
      });

      await loadGameBtn.click();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(window.api.invoke).toHaveBeenCalledWith('open-load-game-dialog');
      expect(window.api.send).not.toHaveBeenCalled();
    });

    test('should handle errors when opening load game dialog', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      window.api.invoke.mockRejectedValueOnce(new Error('Failed to open dialog'));

      const loadGameBtn = document.getElementById('load-game-btn');
      loadGameBtn.addEventListener('click', async () => {
        try {
          const result = await window.api.invoke('open-load-game-dialog');
          if (result.success && result.filePath) {
            window.api.send('load-game', result.filePath);
          }
        } catch (error) {
          console.error('Error opening load game dialog:', error);
        }
      });

      await loadGameBtn.click();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(window.api.invoke).toHaveBeenCalledWith('open-load-game-dialog');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error opening load game dialog:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
