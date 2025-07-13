document.addEventListener('DOMContentLoaded', async () => {
  const consoleDiv = document.getElementById('game-console');
  const input = document.getElementById('game-input');
  const locationStatus = document.getElementById('location-status');

  // Update location display
  async function updateLocationDisplay() {
    const locationState = await window.api.getLocationState();
    if (!locationState) return;

    const system = locationState.system;
    const objects = locationState.objects;

    // Find the primary object (planet or station) in this system
    const primaryObject = objects.find(obj =>
      obj.type === 'Planet' || obj.type === 'Space Station'
    );

    locationStatus.innerHTML = `
      <p>System: ${system.name}</p>
      <p>Type: ${primaryObject ? primaryObject.type : 'Empty System'}</p>
      <p>Population: ${primaryObject ? primaryObject.populationLimit.toLocaleString() : 0}</p>
    `;
  }

  // Initial location update
  await updateLocationDisplay();

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
