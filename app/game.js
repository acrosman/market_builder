document.addEventListener('DOMContentLoaded', async () => {
  const consoleDiv = document.getElementById('game-console');
  const input = document.getElementById('game-input');
  const locationStatus = document.getElementById('location-status');
  const shipStatus = document.getElementById('ship-status');

  // Update location display
  async function updateLocationDisplay() {
    const locationState = await window.api.getLocationState();
    if (!locationState) return;

    const system = locationState.system;
    const objects = locationState.objects;

    // Calculate total population limit
    const totalPopulation = objects.reduce((sum, obj) => sum + (obj.populationLimit || 0), 0);

    // Create list of objects in system
    const objectsList = objects
      .map(obj => `${obj.type} (${obj.className})`)
      .join(', ');

    locationStatus.innerHTML = `
      <p>System: ${system.name}</p>
      <p>Objects: ${objectsList || 'None'}</p>
      <p>Total Population: ${totalPopulation.toLocaleString()}</p>
    `;
  }

  // Add ship status update function
  async function updateShipStatus() {
    const settings = await window.api.getGameSettings();
    const ships = await window.api.getShipData();
    const shuttleData = ships[settings.initial_ship];

    shipStatus.innerHTML = `
      <p>Ship: ${settings.initial_ship}</p>
      <p>HP: ${shuttleData.hitPoints}/${shuttleData.hitPoints}</p>
      <p>Cargo: 0/${shuttleData.cargoCapacity}</p>
      <p>Shields: ${shuttleData.shields}/${shuttleData.shields}</p>
      <p>Energy: ${shuttleData.energy}/${shuttleData.energy}</p>
    `;
  }

  // Initial updates
  await updateLocationDisplay();
  await updateShipStatus();

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
