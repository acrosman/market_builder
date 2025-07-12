document.addEventListener('DOMContentLoaded', () => {
  const consoleDiv = document.getElementById('game-console');
  const input = document.getElementById('game-input');

  // Example: Add a welcome message
  function addMessage(msg) {
    const p = document.createElement('p');
    p.textContent = msg;
    consoleDiv.appendChild(p);
    consoleDiv.scrollTop = consoleDiv.scrollHeight;
  }

  addMessage("Welcome to Universe Market Builder!");
  addMessage("Type a command and press Enter to interact with the game.");

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && input.value.trim()) {
      addMessage("> " + input.value.trim());
      // TODO: Send command to game engine and display response
      input.value = '';
    }
  });
});
