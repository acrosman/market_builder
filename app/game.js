document.addEventListener('DOMContentLoaded', async () => {
  const consoleDiv = document.getElementById('game-console');
  const input = document.getElementById('game-input');
  const locationStatus = document.getElementById('location-status');
  const shipStatus = document.getElementById('ship-status');
  const locationImage = document.getElementById('location-image');
  const noImagePlaceholder = document.getElementById('no-image-placeholder');
  const jumpPlannerBtn = document.getElementById('jump-planner-btn');
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

    console.log('[DEBUG updateLocationDisplay] currentDockedAt:', currentDockedAt);
    console.log('[DEBUG updateLocationDisplay] currentLandedOn:', currentLandedOn);
    console.log('[DEBUG updateLocationDisplay] locationState.playerState:', locationState.playerState);

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
    if (currentDockedAt !== null || currentLandedOn !== null) {
      const objectId = currentDockedAt !== null ? currentDockedAt : currentLandedOn;
      const object = objects.find(obj => obj.id === objectId);
      if (object) {
        const status = currentDockedAt !== null ? 'Docked at' : 'Landed on';
        locationStatus.innerHTML += `<p><strong>${status}: ${object.name}</strong></p>`;
      }
    }

    // Update location image - use landedImage if docked/landed, system image otherwise
    let imageToShow = system.image;
    if (currentDockedAt !== null || currentLandedOn !== null) {
      const objectId = currentDockedAt !== null ? currentDockedAt : currentLandedOn;
      const object = objects.find(obj => obj.id === objectId);
      console.log('[DEBUG updateLocationDisplay] Landed/Docked object:', object);
      console.log('[DEBUG updateLocationDisplay] Object landedImage:', object?.landedImage);
      if (object && object.landedImage) {
        imageToShow = object.landedImage;
      }
    }
    console.log('[DEBUG updateLocationDisplay] Final imageToShow:', imageToShow);

    if (imageToShow) {
      // Adjust path to be relative to app directory (images are in ../data/)
      const adjustedPath = imageToShow.startsWith('data/') ? `../${imageToShow}` : imageToShow;
      locationImage.src = adjustedPath;
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
    if (playerState.dockedAt !== null) {
      const dockedObject = locationState.objects.find(obj => obj.id === playerState.dockedAt);
      statusText = `Status: Docked at ${dockedObject?.name || 'Station'}`;
    } else if (playerState.landedOn != null) {
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


  // Display game start messages
  addMessage('messages:game_start');

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

  // Add a message to the game console
  // Supports plain text or message template keys (e.g., 'messages:game_start', 'messages:tutorial')
  /**
   * Adds a message to the game console
   * @param {string} msg - The message to display. Can be:
   *   - Plain text: displays immediately
   *   - Template key: "messages:key.subkey" loads from game_messages.json and displays asynchronously
   *   - Message key: "message:key.subkey" loads a single message with variable substitution
   * @param {Object} [vars={}] - Optional variables for template substitution (e.g., {systemId: 5, objectName: "Station Alpha"})
   */
  function addMessage(msg, vars = {}) {
    // Check if msg is a message template key (loads entire message group)
    if (typeof msg === 'string' && msg.startsWith('messages:')) {
      const messageKey = msg.replace('messages:', '');
      // Load and display messages asynchronously
      (async () => {
        try {
          const locationState = await window.api.getLocationState();
          const playerName = locationState?.playerState?.name || 'Captain';

          const messages = await window.api.invoke('get-game-messages', messageKey);
          if (messages) {
            // Display title if present
            if (messages.title) {
              addMessage(`=== ${messages.title} ===`);
            }

            // Process each message property (excluding 'title')
            for (const [key, message] of Object.entries(messages).filter(([k]) => k !== 'title')) {
              // Replace template variables
              const processedMessage = message.replace(/\{(\w+)\}/g, (match, variable) => {
                if (variable === 'playerName') return playerName;
                // Add more variable replacements as needed
                return match; // Return original if no match
              });
              addMessage(processedMessage);
            }

            addMessage(''); // Empty line for spacing
          }
        } catch (error) {
          console.error('Error loading messages:', error);
          addMessage('Error: Unable to load game messages.');
        }
      })();
      return;
    }

    // Check if msg is a single message key (loads one message with variables)
    if (typeof msg === 'string' && msg.startsWith('message:')) {
      const messageKey = msg.replace('message:', '');
      // Load and display single message asynchronously
      (async () => {
        try {
          const locationState = await window.api.getLocationState();
          const playerName = locationState?.playerState?.name || 'Captain';

          const message = await window.api.invoke('get-game-messages', messageKey);
          if (message && typeof message === 'string') {
            // Combine default variables with passed variables
            const allVars = { playerName, ...vars };

            // Replace template variables
            const processedMessage = message.replace(/\{(\w+)\}/g, (match, variable) => {
              return allVars[variable] !== undefined ? allVars[variable] : match;
            });
            addMessage(processedMessage);
          }
        } catch (error) {
          console.error('Error loading message:', error);
          addMessage('Error: Unable to load message.');
        }
      })();
      return;
    }

    // Regular message display
    const p = document.createElement('p');
    p.textContent = msg;
    consoleDiv.appendChild(p);
    consoleDiv.scrollTop = consoleDiv.scrollHeight;
  }

  addMessage('message:ui.welcome');
  addMessage('message:ui.help_prompt');

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
      addMessage('message:navigation.taking_off');
      // Disable all action buttons during takeoff
      const buttons = document.querySelectorAll('.action-btn');
      buttons.forEach(btn => btn.disabled = true);
      // Send takeoff request to main process
      window.api.send('take-off');
    }
  }

  function handleJump(targetSystemId) {
    addMessage('message:navigation.jumping', { systemId: targetSystemId });

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
      addMessage('message:navigation.jump_success', { systemName: result.locationState.system.name });

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
      addMessage('message:navigation.dock_success', { objectName: result.dockedObject.name });
      if (result.dockedObject.description) {
        addMessage(result.dockedObject.description);
      }

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
      addMessage('message:navigation.land_success', { objectName: result.landedObject.name });
      if (result.landedObject.description) {
        addMessage(result.landedObject.description);
      }

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
      addMessage('message:navigation.takeoff_success');
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
    addMessage('message:navigation.docking_request', { objectName });

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
    addMessage('message:navigation.landing_request', { objectName });

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
    addMessage('message:save_load.saving');
    window.api.send('save-game');
  });

  // Listen for save game result from main process
  window.api.receive('save-game-result', (result) => {
    if (result.success) {
      addMessage('message:save_load.save_success', { savePath: result.savePath });
    } else {
      addMessage(`Failed to save game: ${result.reason}`);
    }
  });

  // Handle load game action
  loadGameBtn.addEventListener('click', async () => {
    try {
      const result = await window.api.invoke('open-load-game-dialog');
      if (result.success && result.filePath) {
        addMessage('message:save_load.loading');
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
    addMessage('message:save_load.load_recent', { savePath: mostRecentSave });
    window.api.send('load-game', mostRecentSave);
  });

  // Listen for load game result from main process
  window.api.receive('load-game-result', (result) => {
    if (result.success) {
      addMessage('message:save_load.load_success');
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
      document.getElementById('stat-corporation-name').textContent = playerState.corporation.name;
      document.getElementById('stat-corporation-description').textContent = playerState.corporation.description;
      document.getElementById('stat-corporation-value').textContent = playerState.corporation.value.toLocaleString();
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
    addMessage('message:settings.not_implemented');
  });

  // Jump Planner functionality
  jumpPlannerBtn.addEventListener('click', openJumpPlanner);

  async function openJumpPlanner() {
    const locationState = await window.api.getLocationState();
    if (!locationState) return;

    // Check if player is docked or landed
    if (locationState.playerState?.dockedAt != null || locationState.playerState?.landedOn != null) {
      addMessage('Cannot plan jumps while docked or landed. Take off first.');
      return;
    }

    // Get all systems for the selection list
    const allSystems = await window.api.invoke('get-all-systems');
    const currentSystemId = locationState.playerState.location;

    // Validate we received systems data
    if (!allSystems || !Array.isArray(allSystems) || allSystems.length === 0) {
      addMessage('Error: Unable to load system data for jump planner.');
      console.error('[DEBUG openJumpPlanner] allSystems:', allSystems);
      return;
    }

    await loadModal('Jump Planner', './modals/jump-planner.html', async () => {
      // Display current system
      document.getElementById('current-system-display').textContent = `System ${currentSystemId}`;

      document.getElementById('calculate-route-btn').addEventListener('click', async () => {
        const destinationId = parseInt(document.getElementById('destination-system').value);
        console.log('[DEBUG calculate-route] destinationId:', destinationId, 'currentSystemId:', currentSystemId);

        // Validate destination ID
        if (isNaN(destinationId) || destinationId < 1) {
          document.getElementById('route-display').innerHTML = '<p class="error-message">Please enter a valid system ID.</p>';
          return;
        }

        if (destinationId === currentSystemId) {
          document.getElementById('route-display').innerHTML = '<p class="error-message">You are already at this system.</p>';
          return;
        }

        // Check if system exists
        const systemExists = allSystems.some(sys => sys.id === destinationId);
        if (!systemExists) {
          document.getElementById('route-display').innerHTML = '<p class="error-message">System ID does not exist.</p>';
          return;
        }

        const result = await window.api.invoke('calculate-jump-route', {
          start: currentSystemId,
          destination: destinationId
        });
        console.log('[DEBUG calculate-route] result:', result);

        if (!result.success) {
          document.getElementById('route-display').innerHTML = `<p class="error-message">${result.reason}</p>`;
          return;
        }

        // Load the route display template
        const response = await fetch('./modals/jump-route-display.html');
        const template = await response.text();
        document.getElementById('route-display').innerHTML = template;

        // Populate the route display with data
        const route = result.route;
        const routeText = route.map((id, idx) => {
          if (idx === 0) return `System ${id} (current)`;
          if (idx === route.length - 1) return `System ${id} (destination)`;
          return `System ${id}`;
        }).join(' → ');

        document.getElementById('route-path').textContent = routeText;
        document.getElementById('route-jumps').textContent = route.length - 1;
        document.getElementById('route-energy-required').textContent = result.energyRequired;
        document.getElementById('route-energy-available').textContent = result.currentEnergy;

        // Show warning if insufficient energy
        if (result.energyRequired > result.currentEnergy) {
          document.getElementById('route-energy-warning').hidden = false;
          document.getElementById('confirm-jump-route-btn').disabled = true;
        }

        document.getElementById('confirm-jump-route-btn')?.addEventListener('click', () => {
          closeModal();
          executeJumpSequence(route);
        });

        document.getElementById('cancel-jump-route-btn')?.addEventListener('click', () => {
          closeModal();
        });
      });
    });
  }

  async function executeJumpSequence(route) {
    addMessage('message:jump_planner.sequence_start', { destinationId: route[route.length - 1] });
    addMessage('message:jump_planner.route_display', { route: route.join(' → ') });

    // Disable all action buttons during the sequence
    const buttons = document.querySelectorAll('.action-btn');
    buttons.forEach(btn => btn.disabled = true);

    // Execute jumps one at a time, skipping the first (current location)
    for (let i = 1; i < route.length; i++) {
      const targetSystemId = route[i];
      addMessage('message:jump_planner.jump_progress', { systemId: targetSystemId, current: i, total: route.length - 1 });

      // Wait for the jump to complete
      const result = await new Promise((resolve) => {
        const handler = (result) => {
          resolve(result);
        };
        window.api.receive('jump-result', handler);
        window.api.send('jump-to-system', targetSystemId);
      });

      if (!result.success) {
        addMessage(`Jump sequence failed at System ${targetSystemId}: ${result.reason}`);
        buttons.forEach(btn => btn.disabled = false);
        return;
      }

      addMessage('message:jump_planner.arrived', { systemId: targetSystemId });
      await updateLocationDisplay();
      await updateShipStatus();

      // Small delay for visual feedback
      if (i < route.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    addMessage('message:jump_planner.sequence_complete', { destinationId: route[route.length - 1] });
    buttons.forEach(btn => btn.disabled = false);
  }
});
