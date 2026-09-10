document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('new-game-btn').addEventListener('click', () => {
    window.api.send('open-new-game');
  });

  document.getElementById('load-game-btn').addEventListener('click', async () => {
    try {
      const result = await window.api.invoke('open-load-game-dialog');
      if (result.success && result.filePath) {
        // Load the game with the selected file
        window.api.send('load-game', result.filePath);
      }
    } catch (error) {
      if (window.logger && typeof window.logger.error === 'function') {
        window.logger.error('Error opening load game dialog:', error);
      } else {
        console.error('Error opening load game dialog:', error);
      }
    }
  });
});
