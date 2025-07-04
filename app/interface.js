document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('new-game-btn').addEventListener('click', () => {
    window.api.send('open-new-game');
  });
});
