document.addEventListener('DOMContentLoaded', async () => {
  const consoleDiv = document.getElementById('game-console');
  const input = document.getElementById('game-input');
  const locationStatus = document.getElementById('location-status');
  const shipStatus = document.getElementById('ship-status');
  const locationImage = document.getElementById('location-image');
  const noImagePlaceholder = document.getElementById('no-image-placeholder');
  const jumpPlannerBtn = document.getElementById('jump-planner-btn');
  const universeMapBtn = document.getElementById('universe-map-btn');
  const saveGameBtn = document.getElementById('save-game-btn');
  const loadGameBtn = document.getElementById('load-game-btn');
  const playerStatusBtn = document.getElementById('player-status-btn');
  const gameSettingsBtn = document.getElementById('game-settings-btn');
  const commandParser = window.commandParser;

  const commandAliases = {
    l: 'land',
    d: 'dock',
    j: 'jump planner',
    s: 'save game'
  };

  // Store current location state for access in other functions
  let currentLocationState = null;
  let currentDockedAt = null;
  let currentLandedOn = null;
  let isProcessingInputCommand = false;

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

    // Calculate total current population
    const totalPopulation = objects.reduce((sum, obj) => sum + (obj.population?.current || 0), 0);

    // Create list of objects in system
    const objectsList = objects
      .map(obj => `${obj.type} (${obj.className})`)
      .join(', ');

    // Load and populate location status template
    try {
      const response = await fetch('./templates/location-status.html');
      const template = await response.text();
      locationStatus.innerHTML = template;

      // Populate template with data
      document.getElementById('system-name').textContent = system.name;
      document.getElementById('objects-list').textContent = objectsList || 'None';
      document.getElementById('total-population').textContent = totalPopulation.toLocaleString();

      // If docked or landed, show the location information
      const statusEl = document.getElementById('current-location-status');
      const locationPopulationEl = document.getElementById('location-population');
      if (currentDockedAt !== null || currentLandedOn !== null) {
        const objectId = currentDockedAt !== null ? currentDockedAt : currentLandedOn;
        const object = objects.find(obj => obj.id === objectId);
        if (object) {
          const status = currentDockedAt !== null ? 'Docked at' : 'Landed on';
          statusEl.classList.remove('hidden');
          document.getElementById('location-type').textContent = status;
          document.getElementById('location-name').textContent = object.name;
          document.getElementById('location-owner').textContent = object.owner || 'Independent';

          // Show population for all stellar objects (both docked and landed)
          if (object.population) {
            locationPopulationEl.classList.remove('hidden');
            document.getElementById('location-population-current').textContent = object.population.current.toLocaleString();
            document.getElementById('location-population-limit').textContent = object.population.limit.toLocaleString();
          } else {
            locationPopulationEl.classList.add('hidden');
          }
        }
      } else {
        // Hide the status element when in space
        statusEl.classList.add('hidden');
        locationPopulationEl.classList.add('hidden');
      }
    } catch (error) {
      console.error('Error loading location status template:', error);
      // Fallback to basic display
      locationStatus.textContent = `System: ${system.name}`;
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

    // Calculate cargo usage
    let cargoUsed = 0;
    const cargo = playerState.cargo || {};
    const goodsData = await window.api.invoke('get-goods-data');

    // Calculate cargo from goods
    for (const [goodName, quantity] of Object.entries(cargo)) {
      if (goodName === 'passengers') continue; // Handle passengers separately
      const good = goodsData[goodName];
      if (good && good.finishedMass) {
        const mass = good.finishedMass.mass;
        const units = good.finishedMass.units;
        if (units === 'metric tons') {
          cargoUsed += mass * quantity;
        } else if (units === 'kilograms') {
          cargoUsed += (mass * quantity) / 1000; // Convert kg to tons
        }
      }
    }

    // Add passengers cargo (10 people per ton)
    if (cargo.passengers) {
      cargoUsed += cargo.passengers / 10;
    }

    // Determine ship status (in space, docked, or landed)
    let statusText = 'Status: In Space';
    if (playerState.dockedAt !== null) {
      const dockedObject = locationState.objects.find(obj => obj.id === playerState.dockedAt);
      statusText = `Status: Docked at ${dockedObject?.name || 'Station'}`;
    } else if (playerState.landedOn != null) {
      const landedObject = locationState.objects.find(obj => obj.id === playerState.landedOn);
      statusText = `Status: Landed on ${landedObject?.name || 'Planet'}`;
    }

    // Load and populate ship status template
    try {
      const response = await fetch('./templates/ship-status.html');
      const template = await response.text();
      shipStatus.innerHTML = template;

      // Populate template with data
      document.getElementById('ship-type').textContent = shipType;
      document.getElementById('ship-status-text').textContent = statusText;
      document.getElementById('ship-clock').textContent = playerState.ticks || 0;
      document.getElementById('ship-hp').textContent = shipData.hitPoints;
      document.getElementById('ship-max-hp').textContent = shipData.hitPoints;
      document.getElementById('ship-cargo').textContent = cargoUsed.toFixed(2);
      document.getElementById('ship-max-cargo').textContent = shipData.cargoCapacity;
      document.getElementById('ship-shields').textContent = shipData.shields;
      document.getElementById('ship-max-shields').textContent = shipData.shields;
      document.getElementById('ship-energy').textContent = playerState.shipEnergy;
      document.getElementById('ship-max-energy').textContent = playerState.shipMaxEnergy;
    } catch (error) {
      console.error('Error loading ship status template:', error);
      // Fallback to basic display
      shipStatus.textContent = `Ship: ${shipType}`;
    }
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
          const corporationName = locationState?.playerState?.corporation?.name || 'Your Corporation';

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
                if (variable === 'corporationName') return corporationName;
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
    // Handle newlines by creating separate paragraphs
    const lines = msg.split('\n');
    lines.forEach(line => {
      const p = document.createElement('p');
      p.textContent = line || '\u00A0'; // Use non-breaking space for empty lines to preserve spacing
      consoleDiv.appendChild(p);
    });
    consoleDiv.scrollTop = consoleDiv.scrollHeight;
  }

  /**
   * Display all properties of a stellar object in the console
   * @param {Object} obj - The stellar object to display
   */
  async function displayStellarObjectProperties(obj) {
    try {
      // Load template
      const template = await fetch('./templates/stellar-object-properties.html').then(r => r.text());
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = template;
      const propertiesElement = tempDiv.firstElementChild;

      // Populate basic information
      propertiesElement.querySelector('.obj-name').textContent = obj.name;
      propertiesElement.querySelector('.obj-type').textContent = obj.type;
      propertiesElement.querySelector('.obj-class').textContent = obj.className;
      propertiesElement.querySelector('.obj-owner').textContent = obj.owner;
      propertiesElement.querySelector('.obj-value').textContent = obj.value.toLocaleString();

      // Population
      if (obj.population) {
        const popPercent = ((obj.population.current / obj.population.limit) * 100).toFixed(1);
        propertiesElement.querySelector('.obj-population').textContent = obj.population.current.toLocaleString();
        propertiesElement.querySelector('.obj-population-limit').textContent = obj.population.limit.toLocaleString();
        propertiesElement.querySelector('.obj-population-percent').textContent = popPercent;
        propertiesElement.querySelector('.obj-growth-rate').textContent = obj.population.growthRate;
      } else {
        propertiesElement.querySelector('.population-section').style.display = 'none';
      }

      // Buildings
      if (obj.capabilities.buildings) {
        propertiesElement.querySelector('.obj-building-limit').textContent = obj.buildingLimit;
        propertiesElement.querySelector('.obj-building-credits').textContent = obj.buildingCredits.toLocaleString();

        const buildingCount = Object.keys(obj.buildings).length;
        if (buildingCount > 0) {
          propertiesElement.querySelector('.obj-buildings').textContent = JSON.stringify(obj.buildings, null, 2);
        } else {
          propertiesElement.querySelector('.obj-buildings').textContent = 'None';
        }

        if (obj.buildingsUnderConstruction.length > 0) {
          propertiesElement.querySelector('.obj-construction').textContent = JSON.stringify(obj.buildingsUnderConstruction, null, 2);
        } else {
          propertiesElement.querySelector('.construction-list').style.display = 'none';
        }
      } else {
        propertiesElement.querySelector('.buildings-section').style.display = 'none';
      }

      // Capabilities
      const capabilities = [];
      if (obj.capabilities.market) capabilities.push('Market');
      if (obj.capabilities.buildings) capabilities.push('Buildings');
      if (obj.capabilities.shipyard) capabilities.push('Shipyard');
      if (obj.capabilities.shields) capabilities.push('Shields');
      if (obj.capabilities.cannons) capabilities.push('Cannons');
      if (obj.capabilities.fighters) capabilities.push('Fighters');
      if (obj.capabilities.resistance) capabilities.push('Resistance');
      propertiesElement.querySelector('.obj-capabilities').textContent = capabilities.join(', ') || 'None';

      // Fighters
      if (obj.capabilities.fighters && obj.fighters > 0) {
        propertiesElement.querySelector('.obj-fighters').textContent = obj.fighters;
      } else {
        propertiesElement.querySelector('.fighters-section').style.display = 'none';
      }

      // Productivity Modifiers
      if (obj.productivityModifiers) {
        propertiesElement.querySelector('.obj-prod-metal').textContent = obj.productivityModifiers.metal;
        propertiesElement.querySelector('.obj-prod-food').textContent = obj.productivityModifiers.food;
        propertiesElement.querySelector('.obj-prod-chemicals').textContent = obj.productivityModifiers.chemicals;
        propertiesElement.querySelector('.obj-prod-energy').textContent = obj.productivityModifiers.energy;
      }

      // Market State
      if (obj.marketState) {
        const inventoryCount = Object.keys(obj.marketState.inventory || {}).length;
        if (inventoryCount > 0) {
          propertiesElement.querySelector('.obj-market').textContent = JSON.stringify(obj.marketState.inventory, null, 2);
        } else {
          propertiesElement.querySelector('.obj-market').textContent = 'Empty';
        }
      } else {
        propertiesElement.querySelector('.market-section').style.display = 'none';
      }

      // Add to console
      consoleDiv.appendChild(propertiesElement);
      consoleDiv.scrollTop = consoleDiv.scrollHeight;
    } catch (error) {
      console.error('Error displaying stellar object properties:', error);
      addMessage('Error: Unable to display object properties.');
    }
  }

  addMessage('message:ui.welcome');
  addMessage('message:ui.help_prompt');

  /**
   * Enable or disable command input while an action is in progress.
   * @param {boolean} isBusy - True when command input should be disabled.
   */
  function setCommandInputBusy(isBusy) {
    input.disabled = isBusy;
  }

  /**
   * Return buttons that are command-addressable from the game console.
   * @returns {HTMLButtonElement[]} List of command buttons.
   */
  function getCommandButtons() {
    const selectors = [
      '#jump-planner-btn',
      '#universe-map-btn',
      '#save-game-btn',
      '#load-game-btn',
      '#player-status-btn',
      '#game-settings-btn',
      '#jump-buttons .action-btn',
      '#local-buttons .action-btn'
    ];

    return selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
  }

  /**
   * Click a button from command input if it is available.
   * @param {HTMLButtonElement|null} button - Button to execute.
   * @returns {boolean} True when a matching button was found.
   */
  function executeCommandButton(button) {
    if (!button) {
      return false;
    }

    const commandLabel = button.textContent.trim();
    if (button.disabled) {
      addMessage('message:commands.unavailable', { command: commandLabel });
      return true;
    }

    button.click();
    return true;
  }

  /**
   * Execute the first available local action button by action name.
   * @param {string} actionName - Local action dataset name.
   * @returns {boolean} True if a matching local action exists.
   */
  function executeLocalActionShortcut(actionName) {
    const localButtons = Array.from(document.querySelectorAll('#local-buttons .action-btn'))
      .filter((button) => button.dataset.action === actionName);

    if (localButtons.length === 0) {
      addMessage('message:commands.no_action_available', { action: actionName });
      return true;
    }

    const availableButton = localButtons.find((button) => !button.disabled) || localButtons[0];
    return executeCommandButton(availableButton);
  }

  /**
   * Resolve a localized message string for command prompts.
   * @param {string} messageKey - Message key in game_messages.json.
   * @param {Object} vars - Variables used to replace tokens.
   * @param {string} fallback - Fallback text if message lookup fails.
   * @returns {Promise<string>} Resolved message text.
   */
  async function resolveMessageText(messageKey, vars = {}, fallback = '') {
    try {
      const message = await window.api.invoke('get-game-messages', messageKey);
      if (typeof message !== 'string') {
        return fallback;
      }

      return message.replace(/\{(\w+)\}/g, (match, variable) => {
        return vars[variable] !== undefined ? vars[variable] : match;
      });
    } catch (error) {
      console.error('Error resolving message text:', error);
      return fallback;
    }
  }

  /**
   * Offer route calculation and jump sequence to a destination system.
   * @param {number} destinationId - Destination system ID.
   */
  async function offerRouteAndJump(destinationId) {
    const locationState = await window.api.getLocationState();
    if (!locationState) {
      return;
    }

    if (locationState.playerState?.dockedAt != null || locationState.playerState?.landedOn != null) {
      addMessage('message:commands.takeoff_required');
      return;
    }

    const currentSystemId = locationState.playerState.location;
    if (destinationId === currentSystemId) {
      addMessage('message:commands.already_here', { systemId: destinationId });
      return;
    }

    const allSystems = await window.api.invoke('get-all-systems');
    const destinationExists = Array.isArray(allSystems) && allSystems.some((system) => system.id === destinationId);
    if (!destinationExists) {
      addMessage('message:commands.system_not_found', { systemId: destinationId });
      return;
    }

    const routeResult = await window.api.invoke('calculate-jump-route', {
      start: currentSystemId,
      destination: destinationId
    });

    if (!routeResult.success) {
      addMessage('message:commands.route_failed', { reason: routeResult.reason });
      return;
    }

    const routeJumps = routeResult.route.length - 1;
    const confirmPrompt = await resolveMessageText(
      'commands.route_confirm_prompt',
      {
        destinationId,
        jumps: routeJumps,
        cost: routeResult.cost
      },
      `Plot route to System ${destinationId} (${routeJumps} jumps, ${routeResult.cost} ticks) and start jump sequence?`
    );

    if (!window.confirm(confirmPrompt)) {
      addMessage('message:commands.route_cancelled', { systemId: destinationId });
      return;
    }

    closeModal();
    executeJumpSequence(routeResult.route);
  }

  /**
   * Execute a typed command from the game console input.
   * @param {string} rawCommand - Raw command text from the input field.
   */
  async function executeInputCommand(rawCommand) {
    const normalizedCommand = commandParser.normalizeCommandText(rawCommand);
    if (!normalizedCommand) {
      return;
    }

    const numericSystemId = commandParser.parseNumericSystemId(normalizedCommand);
    if (numericSystemId !== null) {
      await offerRouteAndJump(numericSystemId);
      return;
    }

    const canonicalCommand = commandParser.applyAlias(normalizedCommand, commandAliases);
    const jumpTargetSystemId = commandParser.parseJumpSystemId(canonicalCommand);
    if (jumpTargetSystemId !== null) {
      const directJumpButton = document.querySelector(`#jump-buttons .action-btn[data-target-system="${jumpTargetSystemId}"]`);
      if (!executeCommandButton(directJumpButton)) {
        await offerRouteAndJump(jumpTargetSystemId);
      }
      return;
    }

    if (canonicalCommand === 'dock') {
      executeLocalActionShortcut('dock');
      return;
    }

    if (canonicalCommand === 'land') {
      executeLocalActionShortcut('land');
      return;
    }

    const commandButtons = getCommandButtons();
    const exactMatch = commandButtons.find((button) => {
      return commandParser.normalizeCommandText(button.textContent) === canonicalCommand;
    });
    if (executeCommandButton(exactMatch)) {
      return;
    }

    const labels = commandButtons.map((button) => button.textContent);
    const uniqueMatchLabel = commandParser.resolveUniqueFirstWord(canonicalCommand, labels);
    if (uniqueMatchLabel) {
      const uniqueMatchButton = commandButtons.find((button) => {
        return commandParser.normalizeCommandText(button.textContent) === uniqueMatchLabel;
      });

      if (executeCommandButton(uniqueMatchButton)) {
        return;
      }
    }

    addMessage('message:commands.unknown', { command: rawCommand.trim() });
  }

  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && input.value.trim() && !isProcessingInputCommand) {
      const rawCommand = input.value.trim();
      addMessage(`> ${rawCommand}`);
      input.value = '';

      isProcessingInputCommand = true;
      try {
        await executeInputCommand(rawCommand);
      } finally {
        isProcessingInputCommand = false;
      }
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
    Object.keys(locationState.system.connections).forEach(systemId => {
      const numSystemId = Number(systemId);
      const button = document.createElement('button');
      button.className = 'action-btn';
      button.dataset.action = 'jump';
      button.dataset.targetSystem = numSystemId;
      button.textContent = `Jump to System ${numSystemId}`;
      button.disabled = !!(isDocked || isLanded);
      button.addEventListener('click', () => handleJump(numSystemId));
      jumpButtons.appendChild(button);
    });

    // Debug: List all objects in the current system
    console.log('[DEBUG] Objects in current system:', locationState.objects.map(obj => ({ id: obj.id, name: obj.name, type: obj.type, className: obj.className })));

    if (isDocked || isLanded) {
      // Find the current object
      const currentObjectId = isDocked ? locationState.playerState.dockedAt : locationState.playerState.landedOn;
      const currentObject = locationState.objects.find(obj => obj.id === currentObjectId);

      // Add trade button if the object has market capability and player is landed
      if (isLanded && currentObject && currentObject.capabilities?.market) {
        const tradeButton = document.createElement('button');
        tradeButton.className = 'action-btn';
        tradeButton.dataset.action = 'trade';
        tradeButton.textContent = 'Trade';
        tradeButton.addEventListener('click', () => openTradeModal(currentObject));
        localButtons.appendChild(tradeButton);
      }

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
      setCommandInputBusy(true);
      // Send takeoff request to main process
      window.api.send('take-off');
    }
  }

  function handleJump(targetSystemId) {
    addMessage('message:navigation.jumping', { systemId: targetSystemId });

    // Disable all jump buttons during the jump process
    const buttons = document.querySelectorAll('.action-btn');
    buttons.forEach(btn => btn.disabled = true);
    setCommandInputBusy(true);

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
      setCommandInputBusy(false);
    } else {
      // Jump failed
      addMessage(`Jump failed: ${result.reason}`);

      // Re-enable buttons
      const buttons = document.querySelectorAll('.action-btn');
      buttons.forEach(btn => btn.disabled = false);
      setCommandInputBusy(false);
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
      setCommandInputBusy(false);
    } else {
      // Dock failed
      addMessage(`Docking failed: ${result.reason}`);

      // Re-enable buttons
      const buttons = document.querySelectorAll('.action-btn');
      buttons.forEach(btn => btn.disabled = false);
      setCommandInputBusy(false);
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

      // Display all stellar object properties using template
      await displayStellarObjectProperties(result.landedObject);

      // Update the UI with the new landed status
      await updateLocationDisplay();
      await updateShipStatus();

      // Re-enable buttons
      const buttons = document.querySelectorAll('.action-btn');
      buttons.forEach(btn => btn.disabled = false);
      setCommandInputBusy(false);
    } else {
      // Land failed
      addMessage(`Landing failed: ${result.reason}`);

      // Re-enable buttons
      const buttons = document.querySelectorAll('.action-btn');
      buttons.forEach(btn => btn.disabled = false);
      setCommandInputBusy(false);
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
    setCommandInputBusy(false);
  });

  function handleDock(objectId, objectName) {
    addMessage('message:navigation.docking_request', { objectName });

    // Disable all action buttons during the docking process
    const buttons = document.querySelectorAll('.action-btn');
    buttons.forEach(btn => btn.disabled = true);
    setCommandInputBusy(true);

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
    setCommandInputBusy(true);

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
    // Remove wide class if it was added
    const modalContent = document.querySelector('.modal-content');
    if (modalContent) {
      modalContent.classList.remove('wide');
    }
  }

  /**
   * Open the player status modal and populate it with current player data
   */
  async function openPlayerStatusModal() {
    await loadModal('Player Status', './modals/player-status.html', async () => {
      const locationState = await window.api.getLocationState();
      if (!locationState) return;

      const playerState = locationState.playerState;
      const goodsData = await window.api.invoke('get-goods-data');

      // Format cargo display with labels
      const cargoDisplay = Object.keys(playerState.cargo).length > 0
        ? Object.entries(playerState.cargo)
          .map(([good, quantity]) => {
            if (good === 'passengers') return `Passengers: ${quantity}`;
            const goodData = goodsData[good];
            const displayName = goodData?.label || good;
            return `${displayName}: ${quantity}`;
          })
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

      // Add event listener for corporation status button
      const corpStatusBtn = document.getElementById('btn-corporation-status');
      if (corpStatusBtn) {
        corpStatusBtn.addEventListener('click', openCorporationStatusModal);
      }
    });
  }

  /**
   * Open the corporation status modal and populate it with corporation assets
   */
  async function openCorporationStatusModal() {
    await loadModal('Corporation Status', './modals/corporation-status.html', async () => {
      const locationState = await window.api.getLocationState();
      if (!locationState) return;

      const playerState = locationState.playerState;
      const corporation = playerState.corporation;

      // Update corporation header
      document.getElementById('corp-name').textContent = corporation.name;
      document.getElementById('corp-description').textContent = corporation.description;
      document.getElementById('corp-value').textContent = corporation.value.toLocaleString();

      // Get full universe state to access stellar object details
      const universeState = await window.api.getUniverseState();

      // Populate planets list
      const planetsList = document.getElementById('corp-planets-list');
      if (corporation.stellarObjects && corporation.stellarObjects.length > 0) {
        const planetsHTML = corporation.stellarObjects
          .map(objId => {
            const stellarObj = universeState.stellarObjects.find(obj => obj.id === objId);
            if (!stellarObj) return '';
            return `
              <div class="asset-item">
                <strong>${stellarObj.name}</strong> (${stellarObj.className})
                <br>System: ${stellarObj.location}
                <br>Value: ${stellarObj.value.toLocaleString()} credits
              </div>
            `;
          })
          .filter(html => html !== '')
          .join('');
        planetsList.innerHTML = planetsHTML || '<p>No planets owned</p>';
      } else {
        planetsList.innerHTML = '<p>No planets owned</p>';
      }

      // Populate ships list (currently only player ship)
      const shipsList = document.getElementById('corp-ships-list');
      const shipHTML = `
        <div class="asset-item">
          <strong>${playerState.ship}</strong>
          <br>Location: System ${playerState.system}
          <br>Value: ${await getShipValue(playerState.ship)} credits
        </div>
      `;
      shipsList.innerHTML = shipHTML;

      // Add event listener for back button
      const backBtn = document.getElementById('btn-player-status');
      if (backBtn) {
        backBtn.addEventListener('click', openPlayerStatusModal);
      }
    });
  }

  /**
   * Get the value of a ship by its type
   * Ships are valued at 10% below their listed value (depreciation)
   * @param {string} shipType - The type of ship
   * @returns {number} The value of the ship
   */
  async function getShipValue(shipType) {
    try {
      const ships = await window.api.getGameData('ships');
      const baseValue = ships[shipType]?.value || 0;
      // Apply 10% depreciation
      return Math.floor(baseValue * 0.9);
    } catch (error) {
      console.error('Error getting ship value:', error);
      return 0;
    }
  }

  /**
   * Open the trade modal for buying/selling goods and loading passengers
   * @param {Object} stellarObject - The stellar object to trade with
   */
  async function openTradeModal(stellarObject) {
    await loadModal('Trade', './modals/trade.html', async () => {
      // Add wide class to modal for trade interface
      const modalContent = document.querySelector('.modal-content');
      if (modalContent) {
        modalContent.classList.add('wide');
      }

      /**
       * Display an error message in the trade modal
       * @param {string} message - Error message to display
       */
      function showTradeError(message) {
        const errorDiv = document.getElementById('trade-error');
        if (errorDiv) {
          errorDiv.textContent = message;
          errorDiv.classList.remove('hidden');
        }
      }

      /**
       * Hide the error message in the trade modal
       */
      function hideTradeError() {
        const errorDiv = document.getElementById('trade-error');
        if (errorDiv) {
          errorDiv.classList.add('hidden');
        }
      }

      const locationState = await window.api.getLocationState();
      if (!locationState) return;

      const playerState = locationState.playerState;
      const shipsData = await window.api.invoke('get-ships-data');
      const shipData = shipsData[playerState.ship];
      const goodsData = await window.api.invoke('get-goods-data');

      // Set location name
      document.getElementById('trade-location-name').textContent = stellarObject.name;

      // Calculate cargo usage
      let cargoUsed = 0;
      const cargo = playerState.cargo || {};

      // Calculate cargo from goods
      for (const [goodName, quantity] of Object.entries(cargo)) {
        if (goodName === 'passengers') continue; // Handle passengers separately
        const good = goodsData[goodName];
        if (good && good.finishedMass) {
          const mass = good.finishedMass.mass;
          const units = good.finishedMass.units;
          if (units === 'metric tons') {
            cargoUsed += mass * quantity;
          } else if (units === 'kilograms') {
            cargoUsed += (mass * quantity) / 1000; // Convert kg to tons
          }
        }
      }

      // Add passengers cargo (10 people per ton)
      if (cargo.passengers) {
        cargoUsed += cargo.passengers / 10;
      }

      const cargoCapacity = shipData.cargoCapacity;

      // Update cargo display
      document.getElementById('cargo-used').textContent = cargoUsed.toFixed(2);
      document.getElementById('cargo-capacity').textContent = cargoCapacity;

      // Populate goods to buy
      const goodsToBuyDiv = document.getElementById('goods-to-buy');
      goodsToBuyDiv.innerHTML = '';

      if (stellarObject.marketState && stellarObject.marketState.inventory) {
        const inventory = stellarObject.marketState.inventory;
        if (Object.keys(inventory).length === 0) {
          const noGoods = document.createElement('p');
          noGoods.textContent = 'No goods available for purchase.';
          goodsToBuyDiv.appendChild(noGoods);
        } else {
          const tradeItemTemplate = await fetch('./templates/trade-item.html').then(r => r.text());
          for (const [goodName, quantity] of Object.entries(inventory)) {
            if (quantity > 0) {
              const good = goodsData[goodName];
              // Fetch dynamic buy price from backend
              const price = await window.api.invoke('get-market-price', {
                stellarObjectId: stellarObject.id,
                goodName,
                priceType: 'buy'
              }) || good.value;
              const displayName = good.label || goodName;

              const goodDiv = document.createElement('div');
              goodDiv.innerHTML = tradeItemTemplate;
              const container = goodDiv.firstElementChild;

              container.querySelector('#good-name').textContent = displayName;
              container.querySelector('#good-quantity').textContent = `Available: ${quantity}`;
              container.querySelector('#good-price').textContent = `Price: ${price} cr/unit`;

              const input = container.querySelector('#trade-quantity-input');
              input.max = quantity;
              input.setAttribute('data-good', goodName);
              input.setAttribute('data-action', 'buy');

              const btn = container.querySelector('#trade-btn');
              btn.textContent = 'Buy';
              btn.setAttribute('data-good', goodName);
              btn.setAttribute('data-price', price);
              btn.setAttribute('data-action', 'buy');

              goodsToBuyDiv.appendChild(container);
            }
          }
        }
      } else {
        const noMarket = document.createElement('p');
        noMarket.textContent = 'No market available.';
        goodsToBuyDiv.appendChild(noMarket);
      }

      // Populate goods to sell
      const goodsToSellDiv = document.getElementById('goods-to-sell');
      goodsToSellDiv.innerHTML = '';

      if (Object.keys(cargo).filter(k => k !== 'passengers').length === 0) {
        const emptyCargo = document.createElement('p');
        emptyCargo.textContent = 'Your cargo is empty.';
        goodsToSellDiv.appendChild(emptyCargo);
      } else {
        const tradeItemTemplate = await fetch('./templates/trade-item.html').then(r => r.text());
        for (const [goodName, quantity] of Object.entries(cargo)) {
          if (goodName === 'passengers') continue; // Skip passengers in goods section
          if (quantity > 0) {
            const good = goodsData[goodName];
            // Fetch dynamic sell price from backend
            const price = await window.api.invoke('get-market-price', {
              stellarObjectId: stellarObject.id,
              goodName,
              priceType: 'sell'
            }) || good.value;
            const displayName = good.label || goodName;

            const goodDiv = document.createElement('div');
            goodDiv.innerHTML = tradeItemTemplate;
            const container = goodDiv.firstElementChild;

            container.querySelector('#good-name').textContent = displayName;
            container.querySelector('#good-quantity').textContent = `In Cargo: ${quantity}`;
            container.querySelector('#good-price').textContent = `Price: ${price} cr/unit`;

            const input = container.querySelector('#trade-quantity-input');
            input.max = quantity;
            input.setAttribute('data-good', goodName);
            input.setAttribute('data-action', 'sell');

            const btn = container.querySelector('#trade-btn');
            btn.textContent = 'Sell';
            btn.setAttribute('data-good', goodName);
            btn.setAttribute('data-price', price);
            btn.setAttribute('data-action', 'sell');

            goodsToSellDiv.appendChild(container);
          }
        }
      }

      // Add click handlers for buy/sell buttons
      document.querySelectorAll('.trade-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          hideTradeError(); // Clear any previous errors

          const goodName = btn.dataset.good;
          const price = parseFloat(btn.dataset.price);
          const action = btn.dataset.action;
          const input = btn.parentElement.querySelector('.trade-quantity');
          const quantity = parseInt(input.value);

          if (quantity <= 0) {
            showTradeError('Please enter a quantity greater than 0.');
            return;
          }

          const result = await window.api.invoke('trade-goods', {
            action,
            goodName,
            quantity,
            price,
            stellarObjectId: stellarObject.id
          });

          if (result.success) {
            addMessage(result.message);
            closeModal();
            await updateLocationDisplay();
            await updateShipStatus();
          } else {
            showTradeError(result.message);
          }
        });
      });

      // Handle passengers
      const population = stellarObject.population;
      const passengerInfo = document.getElementById('passenger-info');
      const passengerControls = document.getElementById('passenger-controls');
      const noPassengersInfo = document.getElementById('no-passengers-info');

      // Calculate available passengers using the specified formula
      const populationPercent = (population.current / population.limit) * 100;
      let availablePassengers = 0;

      if (populationPercent < 25) {
        availablePassengers = 0;
      } else {
        // Linear scale from 25% to 100%
        // At 25% population: 0% willing to leave
        // At 100% population: 50% willing to leave
        const willingPercent = ((populationPercent - 25) / 75) * 50;
        availablePassengers = Math.floor((population.current * willingPercent) / 100);
      }

      if (availablePassengers === 0) {
        passengerInfo.textContent = 'No passengers seeking transport at this time.';
        passengerControls.classList.add('hidden');
        noPassengersInfo.textContent = population.current < (population.limit * 0.25)
          ? 'Population is too low. People are not willing to leave.'
          : 'No passengers available.';
      } else {
        passengerInfo.textContent = `${availablePassengers.toLocaleString()} passengers seeking transport.`;
        passengerControls.classList.remove('hidden');
        noPassengersInfo.textContent = '';

        const passengerInput = document.getElementById('passenger-count');
        const passengerCargoInfo = document.getElementById('passenger-cargo-info');

        // Calculate max passengers based on available cargo space
        const availableCargoSpace = cargoCapacity - cargoUsed;
        const maxPassengersFromCargo = Math.floor(availableCargoSpace * 10); // 10 people per ton
        const maxPassengers = Math.min(availablePassengers, maxPassengersFromCargo);

        passengerInput.max = maxPassengers;
        passengerInput.value = 0;

        // Update cargo info when input changes
        passengerInput.addEventListener('input', () => {
          const count = parseInt(passengerInput.value) || 0;
          const cargoNeeded = (count / 10).toFixed(2);
          passengerCargoInfo.textContent = `(${cargoNeeded} tons)`;
        });

        // Handle load passengers button
        document.getElementById('load-passengers-btn').addEventListener('click', async () => {
          hideTradeError(); // Clear any previous errors

          const count = parseInt(passengerInput.value);

          if (count <= 0) {
            showTradeError('Please enter a number of passengers to load.');
            return;
          }

          const result = await window.api.invoke('load-passengers', {
            stellarObjectId: stellarObject.id,
            passengerCount: count
          });

          if (result.success) {
            addMessage(result.message);
            closeModal();
            await updateLocationDisplay();
            await updateShipStatus();
          } else {
            showTradeError(result.message);
          }
        });
      }

      // Handle passengers in cargo
      const passengersInCargo = cargo.passengers || 0;
      const passengersInCargoSection = document.getElementById('passengers-in-cargo-section');

      if (passengersInCargo > 0) {
        passengersInCargoSection.classList.remove('hidden');

        const passengersInCargoInfo = document.getElementById('passengers-in-cargo-info');
        passengersInCargoInfo.textContent = `You have ${passengersInCargo.toLocaleString()} passengers on board.`;

        const unloadPassengerInput = document.getElementById('unload-passenger-count');
        const unloadPassengerCargoInfo = document.getElementById('unload-passenger-cargo-info');

        // Calculate max passengers that can be unloaded (limited by population capacity)
        const availablePopulationSpace = population.limit - population.current;
        const maxUnloadPassengers = Math.min(passengersInCargo, availablePopulationSpace);

        unloadPassengerInput.max = maxUnloadPassengers;
        unloadPassengerInput.value = 0;

        // Update cargo info when input changes
        unloadPassengerInput.addEventListener('input', () => {
          const count = parseInt(unloadPassengerInput.value) || 0;
          const cargoFreed = (count / 10).toFixed(2);
          unloadPassengerCargoInfo.textContent = `(frees ${cargoFreed} tons)`;
        });

        // Handle unload passengers button
        document.getElementById('unload-passengers-btn').addEventListener('click', async () => {
          hideTradeError(); // Clear any previous errors

          const count = Math.floor(unloadPassengerInput.valueAsNumber);

          if (isNaN(count) || count <= 0) {
            showTradeError('Please enter a valid number of passengers to unload.');
            return;
          }

          const result = await window.api.invoke('unload-passengers', {
            stellarObjectId: stellarObject.id,
            passengerCount: count
          });

          if (result.success) {
            addMessage(result.message);
            closeModal();
            await updateLocationDisplay();
            await updateShipStatus();
          } else {
            showTradeError(result.message);
          }
        });

        // Handle unload all passengers button
        document.getElementById('unload-all-passengers-btn').addEventListener('click', async () => {
          hideTradeError(); // Clear any previous errors

          const result = await window.api.invoke('unload-passengers', {
            stellarObjectId: stellarObject.id,
            passengerCount: maxUnloadPassengers
          });

          if (result.success) {
            addMessage(result.message);
            closeModal();
            await updateLocationDisplay();
            await updateShipStatus();
          } else {
            showTradeError(result.message);
          }
        });
      } else {
        passengersInCargoSection.classList.add('hidden');
      }
    });
  }

  /**
   * Open the universe map modal and display the universe visualization
   */
  async function openUniverseMapModal() {
    await loadModal('Universe Map', './modals/universe-map.html', async () => {
      // Add wide class to modal for universe map
      const modalContent = document.querySelector('.modal-content');
      if (modalContent) {
        modalContent.classList.add('wide');
      }

      const mapData = await window.api.getUniverseMapData();
      if (!mapData) return;

      const { systems, stellarObjects, exploredSystems } = mapData;

      // Map system id to the most common stellar object type in that system (for coloring)
      const systemType = {};
      systems.forEach(sys => {
        const objs = stellarObjects.filter(obj => obj.location === sys.id);
        if (objs.length > 0) {
          const typeCounts = {};
          objs.forEach(obj => { typeCounts[obj.type] = (typeCounts[obj.type] || 0) + 1; });
          systemType[sys.id] = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0][0];
        } else {
          systemType[sys.id] = null;
        }
      });

      // Prepare nodes and links for D3
      const nodes = systems.map(sys => ({
        id: sys.id,
        name: sys.name,
        type: systemType[sys.id],
        explored: exploredSystems.includes(sys.id)
      }));

      // Build unique links (avoid duplicates)
      const linkSet = new Set();
      systems.forEach(sys => {
        Object.keys(sys.connections).forEach(connId => {
          const numConnId = Number(connId);
          const key = [Math.min(sys.id, numConnId), Math.max(sys.id, numConnId)].join('-');
          linkSet.add(key);
        });
      });
      const links = Array.from(linkSet).map(key => {
        const [source, target] = key.split('-').map(Number);
        return { source, target };
      });

      // Render the universe map
      renderUniverseMap(nodes, links, systems, stellarObjects, exploredSystems);
    });
  }

  /**
   * Render the universe map with D3.js
   * @param {Array} nodes - Array of system nodes
   * @param {Array} links - Array of connections between systems
   * @param {Array} systems - Full system data
   * @param {Array} stellarObjects - All stellar objects
   * @param {Array} exploredSystems - List of explored system IDs
   */
  function renderUniverseMap(nodes, links, systems, stellarObjects, exploredSystems) {
    const diagramElement = document.getElementById('universe-map-diagram');
    const width = diagramElement.clientWidth || 600;
    const height = diagramElement.clientHeight || 500;

    // Assign a color to each type
    const types = Array.from(new Set(stellarObjects.map(obj => obj.type)));
    const color = d3.scaleOrdinal()
      .domain(types)
      .range(d3.schemeCategory10);

    // Clear previous diagram
    d3.select('#universe-map-diagram').selectAll('*').remove();

    // Create SVG and group for zooming
    const svg = d3.select('#universe-map-diagram')
      .append('svg')
      .attr('class', 'universe-svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .style('width', '100%')
      .style('height', '100%');

    const container = svg.append('g');

    // Add zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.2, 5])
      .on('zoom', (event) => {
        container.attr('transform', event.transform);
      });

    svg.call(zoom);

    // Add zoom control button handlers
    const zoomInBtn = document.getElementById('zoom-in');
    const zoomOutBtn = document.getElementById('zoom-out');
    const zoomResetBtn = document.getElementById('zoom-reset');

    if (zoomInBtn) {
      zoomInBtn.addEventListener('click', () => {
        svg.transition().duration(300).call(zoom.scaleBy, 1.3);
      });
    }

    if (zoomOutBtn) {
      zoomOutBtn.addEventListener('click', () => {
        svg.transition().duration(300).call(zoom.scaleBy, 0.7);
      });
    }

    if (zoomResetBtn) {
      zoomResetBtn.addEventListener('click', () => {
        // Re-fit view to show all nodes
        const bounds = container.node().getBBox();
        const dx = bounds.width;
        const dy = bounds.height;
        const x = bounds.x + bounds.width / 2;
        const y = bounds.y + bounds.height / 2;

        const scale = 0.9 / Math.max(dx / width, dy / height);
        const translate = [width / 2 - scale * x, height / 2 - scale * y];

        svg.transition()
          .duration(750)
          .call(zoom.transform, d3.zoomIdentity
            .translate(translate[0], translate[1])
            .scale(scale));
      });
    }

    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(50))
      .force('charge', d3.forceManyBody().strength(-120))
      .force('center', d3.forceCenter(width / 2, height / 2));

    const link = container.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('class', 'universe-link');

    const node = container.append('g')
      .selectAll('circle')
      .data(nodes)
      .join('circle')
      .attr('class', 'universe-node')
      .attr('r', 8)
      .attr('fill', d => {
        if (!d.explored) return '#666';
        return d.type ? color(d.type) : '#888';
      })
      .attr('stroke', d => d.explored ? '#fff' : '#333')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        showSystemDetails(d, systems, stellarObjects, exploredSystems);
      })
      .call(drag(simulation));

    const label = container.append('g')
      .selectAll('text')
      .data(nodes)
      .join('text')
      .attr('class', 'universe-label')
      .attr('dy', -12)
      .text(d => d.name)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        showSystemDetails(d, systems, stellarObjects, exploredSystems);
      });

    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      node
        .attr('cx', d => d.x)
        .attr('cy', d => d.y);

      label
        .attr('x', d => d.x)
        .attr('y', d => d.y);
    });

    // Fit view to show all nodes
    setTimeout(() => {
      const bounds = container.node().getBBox();
      const dx = bounds.width;
      const dy = bounds.height;
      const x = bounds.x + bounds.width / 2;
      const y = bounds.y + bounds.height / 2;

      const scale = 0.9 / Math.max(dx / width, dy / height);
      const translate = [width / 2 - scale * x, height / 2 - scale * y];

      svg.transition()
        .duration(750)
        .call(zoom.transform, d3.zoomIdentity
          .translate(translate[0], translate[1])
          .scale(scale));
    }, 100);

    function drag(simulation) {
      function dragStarted(event, d) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      }
      function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
      }
      function dragEnded(event, d) {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      }
      return d3.drag()
        .on('start', dragStarted)
        .on('drag', dragged)
        .on('end', dragEnded);
    }
  }

  /**
   * Display details about a clicked system
   * @param {Object} systemNode - The clicked system node
   * @param {Array} systems - Full system data
   * @param {Array} stellarObjects - All stellar objects
   * @param {Array} exploredSystems - List of explored system IDs
   */
  async function showSystemDetails(systemNode, systems, stellarObjects, exploredSystems) {
    const detailsDiv = document.getElementById('system-details');
    const system = systems.find(s => s.id === systemNode.id);

    if (!system) {
      detailsDiv.textContent = 'System not found';
      return;
    }

    // Load template
    const template = await fetch('./templates/system-details.html').then(r => r.text());
    detailsDiv.innerHTML = template;

    document.getElementById('system-name').textContent = system.name;

    if (!exploredSystems.includes(system.id)) {
      document.getElementById('system-status').textContent = 'Unexplored';
      document.getElementById('unexplored-message').classList.remove('hidden');
      document.getElementById('explored-content').classList.add('hidden');
      return;
    }

    document.getElementById('system-status').textContent = 'Explored';
    document.getElementById('unexplored-message').classList.add('hidden');
    document.getElementById('explored-content').classList.remove('hidden');

    // Get stellar objects in this system
    const systemObjects = stellarObjects.filter(obj => obj.location === system.id);
    const objectsList = document.getElementById('stellar-objects-list');
    objectsList.innerHTML = '';

    if (systemObjects.length > 0) {
      const itemTemplate = await fetch('./templates/stellar-object-item.html').then(r => r.text());
      systemObjects.forEach(obj => {
        const itemDiv = document.createElement('div');
        itemDiv.innerHTML = itemTemplate;
        const item = itemDiv.firstElementChild;

        item.querySelector('#object-name').textContent = obj.name;
        item.querySelector('#object-type').textContent = obj.type;
        item.querySelector('#object-class').textContent = obj.className;
        item.querySelector('#object-owner').textContent = obj.owner ? `Owner: ${obj.owner}` : 'Independent';

        objectsList.appendChild(item);
      });
    } else {
      const noObjects = document.createElement('p');
      noObjects.textContent = 'No stellar objects in this system';
      objectsList.appendChild(noObjects);
    }

    // Get connected systems
    const connections = Object.keys(system.connections)
      .map(id => `System ${id}`)
      .join(', ');
    document.getElementById('system-connections').textContent = connections || 'None';
  }

  playerStatusBtn.addEventListener('click', openPlayerStatusModal);
  universeMapBtn.addEventListener('click', openUniverseMapModal);

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

  /**
   * Load and display an error message using the error template
   * @param {HTMLElement} container - The container element to display the error in
   * @param {string} message - The error message text
   */
  async function displayErrorMessage(container, message) {
    try {
      const response = await fetch('./templates/error-message.html');
      const template = await response.text();
      container.innerHTML = template;
      document.getElementById('error-message-text').textContent = message;
    } catch (error) {
      console.error('Error loading error message template:', error);
      // Fallback to simple error display
      container.innerHTML = `<p class="error-message">${message}</p>`;
    }
  }

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

        const routeDisplay = document.getElementById('route-display');

        // Validate destination ID
        if (isNaN(destinationId) || destinationId < 1) {
          await displayErrorMessage(routeDisplay, 'Please enter a valid system ID.');
          return;
        }

        if (destinationId === currentSystemId) {
          await displayErrorMessage(routeDisplay, 'You are already at this system.');
          return;
        }

        // Check if system exists
        const systemExists = allSystems.some(sys => sys.id === destinationId);
        if (!systemExists) {
          await displayErrorMessage(routeDisplay, 'System ID does not exist.');
          return;
        }

        const result = await window.api.invoke('calculate-jump-route', {
          start: currentSystemId,
          destination: destinationId
        });
        console.log('[DEBUG calculate-route] result:', result);

        if (!result.success) {
          await displayErrorMessage(routeDisplay, result.reason);
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
        document.getElementById('route-tick-cost').textContent = result.cost;
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
    setCommandInputBusy(true);

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
        setCommandInputBusy(false);
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
    setCommandInputBusy(false);
  }
});
