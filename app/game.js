document.addEventListener(
  'DOMContentLoaded',
  async () => {
    const consoleDiv = document.getElementById('game-console');
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
    let currentDockedAt = null;
    let currentLandedOn = null;

    /**
     * Adds a message to the game console.
     * Supports plain text or message template keys (e.g., 'messages:game_start', 'message:key.subkey').
     * @param {string} msg - The message to display.
     * @param {Object} [vars={}] - Optional variables for template substitution.
     */
    function addMessage(msg, vars = {}) {
      if (typeof msg === 'string' && msg.startsWith('messages:')) {
        const messageKey = msg.replace('messages:', '');
        (async () => {
          try {
            const locationState = await window.api.getLocationState();
            const playerName = locationState?.playerState?.name || 'Captain';
            const corporationName = locationState?.playerState?.corporation?.name || 'Your Corporation';

            const messages = await window.api.invoke('get-game-messages', messageKey);
            if (messages) {
              if (messages.title) {
                addMessage(`=== ${messages.title} ===`);
              }

              for (const [key, message] of Object.entries(messages).filter(([k]) => k !== 'title')) {
                const processedMessage = message.replace(/\{(\w+)\}/g, (match, variable) => {
                  if (variable === 'playerName') return playerName;
                  if (variable === 'corporationName') return corporationName;
                  return match;
                });
                addMessage(processedMessage);
              }

              addMessage('');
            }
          } catch (error) {
            window.logger.error('Error loading messages:', error);
            addMessage('Error: Unable to load game messages.');
          }
        })();
        return;
      }

      if (typeof msg === 'string' && msg.startsWith('message:')) {
        const messageKey = msg.replace('message:', '');
        (async () => {
          try {
            const locationState = await window.api.getLocationState();
            const playerName = locationState?.playerState?.name || 'Captain';

            const message = await window.api.invoke('get-game-messages', messageKey);
            if (message && typeof message === 'string') {
              const allVars = { playerName, ...vars };
              const processedMessage = window.gameHelpers.replaceMessageVariables(message, allVars);
              addMessage(processedMessage);
            }
          } catch (error) {
            window.logger.error('Error loading message:', error);
            addMessage('Error: Unable to load message.');
          }
        })();
        return;
      }

      const lines = msg.split('\n');
      lines.forEach(line => {
        const p = document.createElement('p');
        p.textContent = line || '\u00A0';
        consoleDiv.appendChild(p);
      });
      consoleDiv.scrollTop = consoleDiv.scrollHeight;
    }

    /**
     * Resolve a message key to its text, substituting template variables.
     * @param {string} messageKey - Dot-delimited message key (e.g., 'commands.route_confirm_prompt').
     * @param {Object} [vars={}] - Variables for token substitution.
     * @param {string} [fallback=''] - Fallback text when message is unavailable.
     * @returns {Promise<string>} Resolved message text.
     */
    async function resolveMessageText(messageKey, vars = {}, fallback = '') {
      try {
        const message = await window.api.invoke('get-game-messages', messageKey);
        if (typeof message !== 'string') {
          return fallback;
        }
        return window.gameHelpers.replaceMessageVariables(message, vars);
      } catch (error) {
        window.logger.error('Error resolving message text:', error);
        return fallback;
      }
    }

    /**
     * Display all properties of a stellar object in the console.
     * @param {Object} obj - The stellar object to display.
     */
    async function displayStellarObjectProperties(obj) {
      try {
        const template = await window.gameHelpers.loadTemplate('./templates/stellar-object-properties.html');
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = template;
        const propertiesElement = tempDiv.firstElementChild;

        propertiesElement.querySelector('.obj-name').textContent = obj.name;
        propertiesElement.querySelector('.obj-type').textContent = obj.type;
        propertiesElement.querySelector('.obj-class').textContent = obj.className;
        propertiesElement.querySelector('.obj-owner').textContent = obj.owner;
        propertiesElement.querySelector('.obj-value').textContent = obj.value.toLocaleString();

        if (obj.population) {
          const popPercent = ((obj.population.current / obj.population.limit) * 100).toFixed(1);
          propertiesElement.querySelector('.obj-population').textContent = obj.population.current.toLocaleString();
          propertiesElement.querySelector('.obj-population-limit').textContent = obj.population.limit.toLocaleString();
          propertiesElement.querySelector('.obj-population-percent').textContent = popPercent;
          propertiesElement.querySelector('.obj-growth-rate').textContent = obj.population.growthRate;
        } else {
          propertiesElement.querySelector('.population-section').style.display = 'none';
        }

        if (obj.capabilities.buildings) {
          propertiesElement.querySelector('.obj-building-limit').textContent = obj.buildingLimit;
          propertiesElement.querySelector('.obj-building-credits').textContent = obj.buildingCredits.toLocaleString();

          const buildingCount = Object.keys(obj.buildings).length;
          propertiesElement.querySelector('.obj-buildings').textContent = buildingCount > 0
            ? JSON.stringify(obj.buildings, null, 2)
            : 'None';

          if (obj.buildingsUnderConstruction.length > 0) {
            propertiesElement.querySelector('.obj-construction').textContent = JSON.stringify(obj.buildingsUnderConstruction, null, 2);
          } else {
            propertiesElement.querySelector('.construction-list').style.display = 'none';
          }
        } else {
          propertiesElement.querySelector('.buildings-section').style.display = 'none';
        }

        const capabilities = [];
        if (obj.capabilities.market) capabilities.push('Market');
        if (obj.capabilities.buildings) capabilities.push('Buildings');
        if (obj.capabilities.shipyard) capabilities.push('Shipyard');
        if (obj.capabilities.shields) capabilities.push('Shields');
        if (obj.capabilities.cannons) capabilities.push('Cannons');
        if (obj.capabilities.fighters) capabilities.push('Fighters');
        if (obj.capabilities.resistance) capabilities.push('Resistance');
        propertiesElement.querySelector('.obj-capabilities').textContent = capabilities.join(', ') || 'None';

        if (obj.capabilities.fighters && obj.fighters > 0) {
          propertiesElement.querySelector('.obj-fighters').textContent = obj.fighters;
        } else {
          propertiesElement.querySelector('.fighters-section').style.display = 'none';
        }

        if (obj.productivityModifiers) {
          propertiesElement.querySelector('.obj-prod-metal').textContent = obj.productivityModifiers.metal;
          propertiesElement.querySelector('.obj-prod-food').textContent = obj.productivityModifiers.food;
          propertiesElement.querySelector('.obj-prod-chemicals').textContent = obj.productivityModifiers.chemicals;
          propertiesElement.querySelector('.obj-prod-energy').textContent = obj.productivityModifiers.energy;
        }

        if (obj.marketState) {
          const inventoryCount = Object.keys(obj.marketState.inventory || {}).length;
          propertiesElement.querySelector('.obj-market').textContent = inventoryCount > 0
            ? JSON.stringify(obj.marketState.inventory, null, 2)
            : 'Empty';
        } else {
          propertiesElement.querySelector('.market-section').style.display = 'none';
        }

        consoleDiv.appendChild(propertiesElement);
        consoleDiv.scrollTop = consoleDiv.scrollHeight;
      } catch (error) {
        window.logger.error('Error displaying stellar object properties:', error);
        addMessage('Error: Unable to display object properties.');
      }
    }

    /**
     * Refresh the location display panel and update navigation buttons.
     */
    async function updateLocationDisplay() {
      const locationState = await window.api.getLocationState();
      if (!locationState) return;

      currentDockedAt = locationState.playerState?.dockedAt ?? null;
      currentLandedOn = locationState.playerState?.landedOn ?? null;

      window.logger.debug('[DEBUG updateLocationDisplay] currentDockedAt:', currentDockedAt);
      window.logger.debug('[DEBUG updateLocationDisplay] currentLandedOn:', currentLandedOn);
      window.logger.debug('[DEBUG updateLocationDisplay] locationState.playerState:', locationState.playerState);

      const system = locationState.system;
      if (!system) return;
      const objects = locationState.objects || [];

      const totalPopulation = objects.reduce((sum, obj) => sum + (obj.population?.current || 0), 0);
      const objectsList = objects.map(obj => `${obj.type} (${obj.className})`).join(', ');

      try {
        const template = await window.gameHelpers.loadTemplate('./templates/location-status.html');
        locationStatus.innerHTML = template;

        document.getElementById('system-name').textContent = system.name;
        document.getElementById('objects-list').textContent = objectsList || 'None';
        document.getElementById('total-population').textContent = totalPopulation.toLocaleString();

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

            if (object.population) {
              locationPopulationEl.classList.remove('hidden');
              document.getElementById('location-population-current').textContent = object.population.current.toLocaleString();
              document.getElementById('location-population-limit').textContent = object.population.limit.toLocaleString();
            } else {
              locationPopulationEl.classList.add('hidden');
            }
          }
        } else {
          statusEl.classList.add('hidden');
          locationPopulationEl.classList.add('hidden');
        }
      } catch (error) {
        window.logger.error('Error loading location status template:', error);
        locationStatus.textContent = `System: ${system.name}`;
      }

      let imageToShow = system.image;
      if (currentDockedAt !== null || currentLandedOn !== null) {
        const objectId = currentDockedAt !== null ? currentDockedAt : currentLandedOn;
        const object = objects.find(obj => obj.id === objectId);
        window.logger.debug('[DEBUG updateLocationDisplay] Landed/Docked object:', object);
        window.logger.debug('[DEBUG updateLocationDisplay] Object landedImage:', object?.landedImage);
        if (object && object.landedImage) {
          imageToShow = object.landedImage;
        }
      }
      window.logger.debug('[DEBUG updateLocationDisplay] Final imageToShow:', imageToShow);

      if (imageToShow) {
        const adjustedPath = imageToShow.startsWith('data/') ? `../${imageToShow}` : imageToShow;
        locationImage.src = adjustedPath;
        locationImage.style.display = 'block';
        if (noImagePlaceholder) noImagePlaceholder.style.display = 'none';
      } else {
        locationImage.src = '';
        locationImage.style.display = 'none';
        if (noImagePlaceholder) noImagePlaceholder.style.display = 'block';
      }

      window.navigationHandlers.updateAvailableActions(locationState);
    }

    /**
     * Refresh the ship status panel with current player state.
     */
    async function updateShipStatus() {
      const locationState = await window.api.getLocationState();
      if (!locationState) return;

      const settings = await window.api.getGameSettings();
      const ships = await window.api.getShipData();
      const shipType = settings.initial_ship;
      const shipData = ships[shipType];

      const playerState = locationState.playerState || {
        shipEnergy: shipData.energy,
        shipMaxEnergy: shipData.energy
      };

      const cargo = playerState.cargo || {};
      const goodsData = await window.api.invoke('get-goods-data');
      const cargoUsed = window.gameHelpers.calculateCargoMass(cargo, goodsData);

      let statusText = 'Status: In Space';
      const objects = locationState.objects || [];
      if (playerState.dockedAt !== null) {
        const dockedObject = objects.find(obj => obj.id === playerState.dockedAt);
        statusText = `Status: Docked at ${dockedObject?.name || 'Station'}`;
      } else if (playerState.landedOn != null) {
        const landedObject = objects.find(obj => obj.id === playerState.landedOn);
        statusText = `Status: Landed on ${landedObject?.name || 'Planet'}`;
      }

      try {
        const template = await window.gameHelpers.loadTemplate('./templates/ship-status.html');
        shipStatus.innerHTML = template;

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
        window.logger.error('Error loading ship status template:', error);
        shipStatus.textContent = `Ship: ${shipType}`;
      }
    }

    // --- Initialize sub-modules ---

    window.navigationHandlers.init({
      api: window.api,
      commandParser,
      commandAliases,
      addMessage,
      resolveMessageText,
      updateLocationDisplay,
      updateShipStatus,
      displayStellarObjectProperties,
      closeModal: () => window.modalManager.closeModal(),
      openTradeModal: (obj) => window.modalManager.openTradeModal(obj)
    });

    window.modalManager.init({
      api: window.api,
      addMessage,
      resolveMessageText,
      updateLocationDisplay,
      updateShipStatus,
      displayStellarObjectProperties,
      executeJumpSequence: (route) => window.navigationHandlers.executeJumpSequence(route)
    });

    // --- Game startup ---

    addMessage('messages:game_start');
    addMessage('message:ui.welcome');
    addMessage('message:ui.help_prompt');

    await updateLocationDisplay();
    await updateShipStatus();

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

    // --- Command input ---

    const input = document.getElementById('game-input');
    let isProcessingInputCommand = false;

    input.addEventListener('keydown', async (event) => {
      if (event.key !== 'Enter') return;
      if (isProcessingInputCommand) return;

      const rawCommand = input.value.trim();
      if (!rawCommand) return;

      isProcessingInputCommand = true;
      input.value = '';

      try {
        await window.navigationHandlers.executeInputCommand(rawCommand);
      } finally {
        isProcessingInputCommand = false;
      }
    });

    // --- Save / Load ---

    saveGameBtn.addEventListener('click', () => {
      addMessage('message:save_load.saving');
      window.api.send('save-game');
    });

    window.api.receive('save-game-result', (result) => {
      if (result.success) {
        addMessage('message:save_load.save_success', { savePath: result.savePath });
      } else {
        addMessage('message:save_load.save_failed', { reason: result.reason });
      }
    });

    loadGameBtn.addEventListener('click', async () => {
      try {
        const result = await window.api.invoke('open-load-game-dialog');
        if (result.success && result.filePath) {
          addMessage('message:save_load.loading');
          window.api.send('load-game', result.filePath);
        }
      } catch (error) {
        window.logger.error('Error opening load game dialog:', error);
        addMessage('message:save_load.load_dialog_error');
      }
    });

    window.api.receive('save-files-list', (saveFiles) => {
      if (saveFiles.length === 0) {
        addMessage('No save files found.');
        return;
      }
      const mostRecentSave = saveFiles[saveFiles.length - 1];
      addMessage('message:save_load.load_recent', { savePath: mostRecentSave });
      window.api.send('load-game', mostRecentSave);
    });

    window.api.receive('load-game-result', (result) => {
      if (result.success) {
        addMessage('message:save_load.load_success');
        updateLocationDisplay();
        updateShipStatus();
      } else {
        addMessage('message:save_load.load_failed', { reason: result.reason });
      }
    });

    // --- Static UI button wiring ---

    playerStatusBtn.addEventListener('click', () => window.modalManager.openPlayerStatusModal());
    universeMapBtn.addEventListener('click', () => window.modalManager.openUniverseMapModal());
    jumpPlannerBtn.addEventListener('click', () => window.modalManager.openJumpPlanner());

    gameSettingsBtn.addEventListener('click', () => {
      addMessage('message:settings.not_implemented');
    });
  },
  { once: true }
);
