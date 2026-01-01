document.addEventListener('DOMContentLoaded', async () => {
  const consoleDiv = document.getElementById('game-console');
  const input = document.getElementById('game-input');
  const locationStatus = document.getElementById('location-status');
  const shipStatus = document.getElementById('ship-status');
  const locationImage = document.getElementById('location-image');
  const noImagePlaceholder = document.getElementById('no-image-placeholder');
  const saveGameBtn = document.getElementById('save-game-btn');
  const loadGameBtn = document.getElementById('load-game-btn');
  const playerStatusBtn = document.getElementById('player-status-btn');
  const gameSettingsBtn = document.getElementById('game-settings-btn');

  // Store current location state for access in other functions
  let currentLocationState = null;
  let currentDockedAt = null;
  let currentLandedOn = null;

  // Update location display
  async function updateLocationDisplay() {
    const locationState = await window.api.getLocationState();
    if (!locationState) return;

    // Store the location state
    currentLocationState = locationState;
    currentDockedAt = locationState.playerState?.dockedAt ?? null;
    currentLandedOn = locationState.playerState?.landedOn ?? null;

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

    // If docked or landed, show the location information
    if (currentDockedAt || currentLandedOn) {
      const objectId = currentDockedAt || currentLandedOn;
      const object = objects.find(obj => obj.id === objectId);
      if (object) {
        const status = currentDockedAt ? 'Docked at' : 'Landed on';
        locationStatus.innerHTML += `<p><strong>${status}: ${object.name}</strong></p>`;
      }
    }

    // Update location image - use landedImage if docked/landed, system image otherwise
    let imageToShow = system.image;
    if (currentDockedAt || currentLandedOn) {
      const objectId = currentDockedAt || currentLandedOn;
      const object = objects.find(obj => obj.id === objectId);
      if (object && object.landedImage) {
        imageToShow = object.landedImage;
      }
    }

    if (imageToShow) {
      locationImage.src = imageToShow;
      locationImage.style.display = 'block';
      if (noImagePlaceholder) noImagePlaceholder.style.display = 'none';
    } else {
      locationImage.src = '';
      locationImage.style.display = 'none';
      if (noImagePlaceholder) noImagePlaceholder.style.display = 'block';
    }

    updateAvailableActions(locationState);
  }

  // Add ship status update function
  async function updateShipStatus() {
    const locationState = await window.api.getLocationState();
    if (!locationState) return;

    const settings = await window.api.getGameSettings();
    const ships = await window.api.getShipData();
    const shipType = settings.initial_ship;
    const shipData = ships[shipType];

    // Get player state for current energy levels
    const playerState = locationState.playerState || {
      shipEnergy: shipData.energy,
      shipMaxEnergy: shipData.energy
    };

    // Determine ship status (in space, docked, or landed)
    let statusText = 'Status: In Space';
    if (playerState.dockedAt) {
      const dockedObject = locationState.objects.find(obj => obj.id === playerState.dockedAt);
      statusText = `Status: Docked at ${dockedObject?.name || 'Station'}`;
    } else if (playerState.landedOn) {
      const landedObject = locationState.objects.find(obj => obj.id === playerState.landedOn);
      statusText = `Status: Landed on ${landedObject?.name || 'Planet'}`;
    }

    shipStatus.innerHTML = `
      <p>Ship: ${shipType}</p>
      <p>${statusText}</p>
      <p>HP: ${shipData.hitPoints}/${shipData.hitPoints}</p>
      <p>Cargo: 0/${shipData.cargoCapacity}</p>
      <p>Shields: ${shipData.shields}/${shipData.shields}</p>
      <p>Energy: ${playerState.shipEnergy}/${playerState.shipMaxEnergy}</p>
    `;
  }


  // Initial updates
  await updateLocationDisplay();
  await updateShipStatus();

  // Attach image load/error handlers to comply with CSP (avoid inline handlers)
  if (locationImage) {
    locationImage.addEventListener('error', () => {
      locationImage.style.display = 'none';
      if (noImagePlaceholder) noImagePlaceholder.style.display = 'block';
    });

    locationImage.addEventListener('load', () => {
      if (noImagePlaceholder) noImagePlaceholder.style.display = 'none';
      locationImage.style.display = 'block';
    });
  }

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

    // Always render jump buttons, but disable if docked or landed
    const isDocked = locationState.playerState?.dockedAt != null;
    const isLanded = locationState.playerState?.landedOn != null;
    locationState.system.connections.forEach(systemId => {
      const button = document.createElement('button');
      button.className = 'action-btn';
      button.dataset.action = 'jump';
      button.dataset.targetSystem = systemId;
      button.textContent = `Jump to System ${systemId}`;
      button.disabled = !!(isDocked || isLanded);
      button.addEventListener('click', () => handleJump(systemId));
      jumpButtons.appendChild(button);
    });

    // Debug: List all objects in the current system
    console.log('[DEBUG] Objects in current system:', locationState.objects.map(obj => ({ id: obj.id, name: obj.name, type: obj.type, className: obj.className })));

    if (isDocked || isLanded) {
      const takeOffButton = document.createElement('button');
      takeOffButton.className = 'action-btn';
      takeOffButton.dataset.action = 'takeoff';
      takeOffButton.textContent = 'Take Off';
      takeOffButton.addEventListener('click', handleTakeOff);
      localButtons.appendChild(takeOffButton);
    } else {
      // Add local action buttons based on available objects
      locationState.objects.forEach(obj => {
        if (obj.type === 'Space Station') {
          const dockButton = document.createElement('button');
          dockButton.className = 'action-btn';
          dockButton.dataset.action = 'dock';
          dockButton.dataset.objectId = obj.id;
          dockButton.textContent = `Dock at ${obj.name}`;
          dockButton.addEventListener('click', () => handleDock(obj.id, obj.name));
          localButtons.appendChild(dockButton);
        } else if (obj.type === 'Planet' || obj.type === 'Asteroid') {
          // Debug: Log when creating a land button
          console.log('[DEBUG] Creating land button for:', { id: obj.id, name: obj.name, type: obj.type, className: obj.className });
          const landButton = document.createElement('button');
          landButton.className = 'action-btn';
          landButton.dataset.action = 'land';
          landButton.dataset.objectId = obj.id;
          landButton.textContent = `Land on ${obj.name}`;
          landButton.addEventListener('click', () => handleLand(obj.id, obj.name));
          localButtons.appendChild(landButton);
        }
      });
    }
    // Handle take off action
    function handleTakeOff() {
      addMessage('Taking off...');
      // Disable all action buttons during takeoff
      const buttons = document.querySelectorAll('.action-btn');
      buttons.forEach(btn => btn.disabled = true);
      // Send takeoff request to main process
      window.api.send('take-off');
    }
  }

  function handleJump(targetSystemId) {
    addMessage(`Jumping to System ${targetSystemId}...`);

    // Disable all jump buttons during the jump process
    const buttons = document.querySelectorAll('.action-btn');
    buttons.forEach(btn => btn.disabled = true);

    // Send jump request to main process
    window.api.send('jump-to-system', targetSystemId);
  }

  // Listen for jump result from main process
  window.api.receive('jump-result', async (result) => {
    if (result.success) {
      // Jump was successful
      addMessage(`Jump to ${result.locationState.system.name} completed successfully.`);

      // Update the UI with the new location information
      await updateLocationDisplay();
      await updateShipStatus();

      // Re-enable buttons
      const buttons = document.querySelectorAll('.action-btn');
      buttons.forEach(btn => btn.disabled = false);
    } else {
      // Jump failed
      addMessage(`Jump failed: ${result.reason}`);

      // Re-enable buttons
      const buttons = document.querySelectorAll('.action-btn');
      buttons.forEach(btn => btn.disabled = false);
    }
  });

  // Listen for dock result from main process
  window.api.receive('dock-result', async (result) => {
    if (result.success) {
      // Dock was successful
      addMessage(`Welcome to ${result.dockedObject.name}. Docking sequence complete.`);

      // Update the UI with the new docked status
      await updateLocationDisplay();
      await updateShipStatus();

      // Re-enable buttons
      const buttons = document.querySelectorAll('.action-btn');
      buttons.forEach(btn => btn.disabled = false);
    } else {
      // Dock failed
      addMessage(`Docking failed: ${result.reason}`);

      // Re-enable buttons
      const buttons = document.querySelectorAll('.action-btn');
      buttons.forEach(btn => btn.disabled = false);
    }
  });

  // Listen for land result from main process
  window.api.receive('land-result', async (result) => {
    if (result.success) {
      // Land was successful
      addMessage(`Welcome to ${result.landedObject.name}. Landing sequence complete.`);

      // Update the UI with the new landed status
      await updateLocationDisplay();
      await updateShipStatus();

      // Re-enable buttons
      const buttons = document.querySelectorAll('.action-btn');
      buttons.forEach(btn => btn.disabled = false);
    } else {
      // Land failed
      addMessage(`Landing failed: ${result.reason}`);

      // Re-enable buttons
      const buttons = document.querySelectorAll('.action-btn');
      buttons.forEach(btn => btn.disabled = false);
    }
  });

  // Listen for takeoff result from main process
  window.api.receive('takeoff-result', async (result) => {
    if (result.success) {
      addMessage('Takeoff successful.');
      // Update the UI with the new status
      await updateLocationDisplay();
      await updateShipStatus();
    } else {
      addMessage(`Takeoff failed: ${result.reason}`);
    }
    // Re-enable buttons
    const buttons = document.querySelectorAll('.action-btn');
    buttons.forEach(btn => btn.disabled = false);
  });

  function handleDock(objectId, objectName) {
    addMessage(`Requesting docking permission at ${objectName}...`);

    // Disable all action buttons during the docking process
    const buttons = document.querySelectorAll('.action-btn');
    buttons.forEach(btn => btn.disabled = true);

    // Additionally, disable navigation (jump) buttons immediately
    const jumpButtons = document.querySelectorAll('#jump-buttons .action-btn');
    jumpButtons.forEach(btn => btn.disabled = true);

    // Send dock request to main process
    window.api.send('dock-at-station', objectId);
  }

  function handleLand(objectId, objectName) {
    addMessage(`Preparing for landing on ${objectName}...`);

    // Disable all action buttons during the landing process
    const buttons = document.querySelectorAll('.action-btn');
    buttons.forEach(btn => btn.disabled = true);

    // Additionally, disable navigation (jump) buttons immediately
    const jumpButtons = document.querySelectorAll('#jump-buttons .action-btn');
    jumpButtons.forEach(btn => btn.disabled = true);

    // Ensure objectId is a number before sending
    const numericObjectId = typeof objectId === 'string' ? parseInt(objectId, 10) : objectId;
    window.api.send('land-on-surface', numericObjectId);
  }


  // Handle save game action
  saveGameBtn.addEventListener('click', () => {
    addMessage('Saving game...');
    window.api.send('save-game');
  });

  // Listen for save game result from main process
  window.api.receive('save-game-result', (result) => {
    if (result.success) {
      addMessage(`Game saved successfully. Save file: ${result.savePath}`);
    } else {
      addMessage(`Failed to save game: ${result.reason}`);
    }
  });

  // Handle load game action
  loadGameBtn.addEventListener('click', async () => {
    try {
      const result = await window.api.invoke('open-load-game-dialog');
      if (result.success && result.filePath) {
        addMessage('Loading game...');
        // Load the game with the selected file
        window.api.send('load-game', result.filePath);
      }
    } catch (error) {
      console.error('Error opening load game dialog:', error);
      addMessage('Error opening file dialog');
    }
  });

  // Listen for save files list from main process
  window.api.receive('save-files-list', (saveFiles) => {
    if (saveFiles.length === 0) {
      addMessage('No save files found.');
      return;
    }

    // For simplicity, we'll just load the most recent save file
    // In a full implementation, you'd want to show a list to the user
    const mostRecentSave = saveFiles[saveFiles.length - 1];
    addMessage(`Loading most recent save: ${mostRecentSave}`);
    window.api.send('load-game', mostRecentSave);
  });

  // Listen for load game result from main process
  window.api.receive('load-game-result', (result) => {
    if (result.success) {
      addMessage('Game loaded successfully.');
      // Update the game state here
      updateLocationDisplay();
      updateShipStatus();
    } else {
      addMessage(`Failed to load game: ${result.reason}`);
    }
  });

  // Modal system - reusable for different modal types
  const gameModal = document.getElementById('game-modal');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  const modalCloseBtn = document.getElementById('modal-close-btn');

  /**
   * Load and display a modal with the specified title and content file
   * @param {string} title - Title to display in the modal header
   * @param {string} contentFile - Path to the HTML content file (relative to app/)
   * @param {Function} onLoad - Optional callback function called after content is loaded
   */
  async function loadModal(title, contentFile, onLoad) {
    try {
      const response = await fetch(contentFile);
      if (!response.ok) {
        console.error(`Failed to load modal content: ${contentFile}`);
        return;
      }
      const html = await response.text();

      // Set modal title and content
      modalTitle.textContent = title;
      modalBody.innerHTML = html;

      // Call the optional callback to populate the content
      if (onLoad && typeof onLoad === 'function') {
        await onLoad();
      }

      // Show the modal
      gameModal.classList.add('visible');
    } catch (error) {
      console.error('Error loading modal:', error);
    }
  }

  /**
   * Close the currently displayed modal
   */
  function closeModal() {
    gameModal.classList.remove('visible');
    modalBody.innerHTML = '';
  }

  /**
   * Open the player status modal and populate it with current player data
   */
  async function openPlayerStatusModal() {
    await loadModal('Player Status', './modals/player-status.html', async () => {
      const locationState = await window.api.getLocationState();
      if (!locationState) return;

      const playerState = locationState.playerState;

      // Format cargo display
      const cargoDisplay = Object.keys(playerState.cargo).length > 0
        ? Object.entries(playerState.cargo)
          .map(([good, quantity]) => `${good}: ${quantity}`)
          .join(', ')
        : 'Empty';

      // Update modal content with player data
      document.getElementById('stat-name').textContent = playerState.name;
      document.getElementById('stat-credits').textContent = playerState.credits.toLocaleString();
      document.getElementById('stat-ship').textContent = playerState.ship;
      document.getElementById('stat-energy').textContent = `${playerState.shipEnergy}/${playerState.shipMaxEnergy}`;
      document.getElementById('stat-cargo').textContent = cargoDisplay;
      document.getElementById('stat-jumps').textContent = playerState.stats.jumps;
      document.getElementById('stat-trades').textContent = playerState.stats.trades;
      document.getElementById('stat-profit').textContent = playerState.stats.profit.toLocaleString();
    });
  }

  playerStatusBtn.addEventListener('click', openPlayerStatusModal);

  // Close modal when close button is clicked
  modalCloseBtn.addEventListener('click', closeModal);

  // Close modal when Escape key is pressed
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && gameModal.classList.contains('visible')) {
      closeModal();
    }
  });

  // Close modal when clicking outside the modal content
  gameModal.addEventListener('click', (event) => {
    if (event.target === gameModal) {
      closeModal();
    }
  });

  gameSettingsBtn.addEventListener('click', () => {
    addMessage('Game Settings feature is not yet implemented.');
  });
});
