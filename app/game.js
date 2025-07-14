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

    // Update location status
    locationStatus.innerHTML = `
      <p>System: ${system.name}</p>
      <p>Objects: ${objectsList || 'None'}</p>
      <p>Total Population: ${totalPopulation.toLocaleString()}</p>
    `;

    // Update location image
    const locationImage = document.getElementById('location-image');
    if (system.image) {
      locationImage.src = system.image;
      locationImage.style.display = 'block';
    } else {
      locationImage.style.display = 'none';
    }

    updateAvailableActions(locationState);
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

  // Update action button states based on location
  async function updateAvailableActions(locationState) {
    const jumpButtons = document.getElementById('jump-buttons');
    const localButtons = document.getElementById('local-buttons');

    // Clear existing buttons
    jumpButtons.innerHTML = '';
    localButtons.innerHTML = '';

    // Add jump buttons for connected systems
    locationState.system.connections.forEach(systemId => {
      const button = document.createElement('button');
      button.className = 'action-btn';
      button.dataset.action = 'jump';
      button.dataset.targetSystem = systemId;
      button.textContent = `Jump to System ${systemId}`;
      button.addEventListener('click', () => handleJump(systemId));
      jumpButtons.appendChild(button);
    });

    // Add local action buttons based on available objects
    const hasStation = locationState.objects.some(obj => obj.type === 'Space Station');
    const hasPlanet = locationState.objects.some(obj =>
      obj.type === 'Planet' || obj.type === 'Asteroid'
    );

    if (hasStation) {
      const dockButton = document.createElement('button');
      dockButton.className = 'action-btn';
      dockButton.dataset.action = 'dock';
      dockButton.textContent = 'Dock at Station';
      dockButton.addEventListener('click', () => handleDock());
      localButtons.appendChild(dockButton);
    }

    if (hasPlanet) {
      const landButton = document.createElement('button');
      landButton.className = 'action-btn';
      landButton.dataset.action = 'land';
      landButton.textContent = 'Land on Surface';
      landButton.addEventListener('click', () => handleLand());
      localButtons.appendChild(landButton);
    }
  }

  function handleJump(targetSystemId) {
    addMessage(`Jumping to System ${targetSystemId}...`);
    // TODO: Implement actual jump logic
    window.api.send('jump-to-system', targetSystemId);
  }

  function handleDock() {
    addMessage('Requesting docking permission...');
    // TODO: Implement docking logic
    window.api.send('dock-at-station');
  }

  function handleLand() {
    addMessage('Preparing for landing...');
    // TODO: Implement landing logic
    window.api.send('land-on-surface');
  }
});
