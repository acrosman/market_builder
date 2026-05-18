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
      window.logger.error('Error opening load game dialog:', error);
      alert('Error opening file dialog');
    }
  });
});
