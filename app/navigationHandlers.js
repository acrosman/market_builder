(function () {
  // Context references set during init()
  let _api;
  let _commandParser;
  let _commandAliases;
  let _addMessage;
  let _resolveMessageText;
  let _updateLocationDisplay;
  let _updateShipStatus;
  let _displayStellarObjectProperties;
  let _closeModal;
  let _openTradeModal;

  /**
   * Initialize the navigation handlers module with shared game context.
   * Registers IPC receive handlers for all navigation results.
   * @param {Object} context - Shared game context.
   * @param {Object} context.api - window.api IPC bridge.
   * @param {Object} context.commandParser - Parsed command utilities.
   * @param {Object} context.commandAliases - Command alias map.
   * @param {Function} context.addMessage - Display a message in the console.
   * @param {Function} context.resolveMessageText - Resolve a localized message string.
   * @param {Function} context.updateLocationDisplay - Refresh the location display.
   * @param {Function} context.updateShipStatus - Refresh the ship status panel.
   * @param {Function} context.displayStellarObjectProperties - Display object details.
   * @param {Function} context.closeModal - Close the currently open modal.
   * @param {Function} context.openTradeModal - Open the trade modal for an object.
   */
  function init(context) {
    _api = context.api;
    _commandParser = context.commandParser;
    _commandAliases = context.commandAliases;
    _addMessage = context.addMessage;
    _resolveMessageText = context.resolveMessageText;
    _updateLocationDisplay = context.updateLocationDisplay;
    _updateShipStatus = context.updateShipStatus;
    _displayStellarObjectProperties = context.displayStellarObjectProperties;
    _closeModal = context.closeModal;
    _openTradeModal = context.openTradeModal;

    _api.receive('jump-result', async (result) => {
      if (result.success) {
        _addMessage('message:navigation.jump_success', { systemName: result.locationState.system.name });
        await _updateLocationDisplay();
        await _updateShipStatus();
      } else {
        _addMessage('message:navigation.jump_failed', { reason: result.reason });
      }
      _finishAction();
    });

    _api.receive('dock-result', async (result) => {
      if (result.success) {
        _addMessage('message:navigation.dock_success', { objectName: result.dockedObject.name });
        if (result.dockedObject.description) {
          _addMessage(result.dockedObject.description);
        }
        await _updateLocationDisplay();
        await _updateShipStatus();
      } else {
        _addMessage('message:navigation.dock_failed', { reason: result.reason });
      }
      _finishAction();
    });

    _api.receive('land-result', async (result) => {
      if (result.success) {
        _addMessage('message:navigation.land_success', { objectName: result.landedObject.name });
        if (result.landedObject.description) {
          _addMessage(result.landedObject.description);
        }
        await _displayStellarObjectProperties(result.landedObject);
        await _updateLocationDisplay();
        await _updateShipStatus();
      } else {
        _addMessage('message:navigation.land_failed', { reason: result.reason });
      }
      _finishAction();
    });

    _api.receive('takeoff-result', async (result) => {
      if (result.success) {
        _addMessage('message:navigation.takeoff_success');
        await _updateLocationDisplay();
        await _updateShipStatus();
      } else {
        _addMessage('message:navigation.takeoff_failed', { reason: result.reason });
      }
      _finishAction();
    });
  }

  /**
   * Re-enable all action buttons after an operation completes.
   */
  function _enableAllButtons() {
    document.querySelectorAll('.action-btn').forEach(btn => {
      btn.disabled = false;
    });
  }

  /**
   * Disable all action buttons while an operation is in progress.
   */
  function _disableAllButtons() {
    document.querySelectorAll('.action-btn').forEach(btn => {
      btn.disabled = true;
    });
  }

  /**
   * Apply the busy state for command-driven actions.
   */
  function _startAction() {
    _disableAllButtons();
    setCommandInputBusy(true);
  }

  /**
   * Clear busy state after command-driven actions complete.
   */
  function _finishAction() {
    _enableAllButtons();
    setCommandInputBusy(false);
  }

  /**
   * Enable or disable the command input while an action is in progress.
   * @param {boolean} isBusy - True when command input should be disabled.
   */
  function setCommandInputBusy(isBusy) {
    const input = document.getElementById('game-input');
    if (input) {
      input.disabled = isBusy;
    }
  }

  /**
   * Return all command-addressable buttons from the game interface.
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
   * Click a button if available; display an unavailable message if disabled.
   * @param {HTMLButtonElement|null} button - Button to execute.
   * @returns {boolean} True when a matching button was found.
   */
  function executeCommandButton(button) {
    if (!button) {
      return false;
    }

    const commandLabel = button.textContent.trim();
    if (button.disabled) {
      _addMessage('message:commands.unavailable', { command: commandLabel });
      return true;
    }

    button.click();
    return true;
  }

  /**
   * Execute the first available local action button matching the given action name.
   * @param {string} actionName - Local action dataset name (e.g. 'dock', 'land').
   * @returns {boolean} True if a matching local action button was found.
   */
  function executeLocalActionShortcut(actionName) {
    const localButtons = Array.from(document.querySelectorAll('#local-buttons .action-btn'))
      .filter((button) => button.dataset.action === actionName);

    if (localButtons.length === 0) {
      _addMessage('message:commands.no_action_available', { action: actionName });
      return true;
    }

    const availableButton = localButtons.find((button) => !button.disabled) || localButtons[0];
    return executeCommandButton(availableButton);
  }

  /**
   * Initiate a jump to the target system.
   * @param {number} targetSystemId - Destination system ID.
   */
  function handleJump(targetSystemId) {
    _addMessage('message:navigation.jumping', { systemId: targetSystemId });
    _startAction();
    _api.send('jump-to-system', targetSystemId);
  }

  /**
   * Request docking at the specified station.
   * @param {number|string} objectId - Station object ID.
   * @param {string} objectName - Station display name.
   */
  function handleDock(objectId, objectName) {
    _addMessage('message:navigation.docking_request', { objectName });
    _startAction();
    _api.send('dock-at-station', objectId);
  }

  /**
   * Request landing on the specified planet or asteroid.
   * @param {number|string} objectId - Stellar object ID.
   * @param {string} objectName - Object display name.
   */
  function handleLand(objectId, objectName) {
    _addMessage('message:navigation.landing_request', { objectName });
    _startAction();
    const numericObjectId = typeof objectId === 'string' ? parseInt(objectId, 10) : objectId;
    _api.send('land-on-surface', numericObjectId);
  }

  /**
   * Initiate takeoff from current docked or landed position.
   */
  function handleTakeOff() {
    _addMessage('message:navigation.taking_off');
    _startAction();
    _api.send('take-off');
  }

  /**
   * Validate a destination, calculate route, prompt for confirmation, then jump.
   * @param {number} destinationId - Destination system ID.
   */
  async function offerRouteAndJump(destinationId) {
    const locationState = await _api.getLocationState();
    if (!locationState) {
      return;
    }

    if (locationState.playerState?.dockedAt != null || locationState.playerState?.landedOn != null) {
      _addMessage('message:commands.takeoff_required');
      return;
    }

    const currentSystemId = locationState.playerState.location;
    if (destinationId === currentSystemId) {
      _addMessage('message:commands.already_here', { systemId: destinationId });
      return;
    }

    const allSystems = await _api.invoke('get-all-systems');
    const destinationExists = Array.isArray(allSystems) && allSystems.some((system) => system.id === destinationId);
    if (!destinationExists) {
      _addMessage('message:commands.system_not_found', { systemId: destinationId });
      return;
    }

    const routeResult = await _api.invoke('calculate-jump-route', {
      start: currentSystemId,
      destination: destinationId
    });

    if (!routeResult.success) {
      _addMessage('message:commands.route_failed', { reason: routeResult.reason });
      return;
    }

    const routeJumps = routeResult.route.length - 1;
    const confirmPrompt = await _resolveMessageText(
      'commands.route_confirm_prompt',
      {
        destinationId,
        jumps: routeJumps,
        cost: routeResult.cost
      },
      `Plot route to System ${destinationId} (${routeJumps} jumps, ${routeResult.cost} ticks) and start jump sequence?`
    );

    if (!window.confirm(confirmPrompt)) {
      _addMessage('message:commands.route_cancelled', { systemId: destinationId });
      return;
    }

    _closeModal();
    await executeJumpSequence(routeResult.route);
  }

  /**
   * Execute a multi-jump sequence, advancing one hop at a time.
   * @param {number[]} route - Ordered array of system IDs, starting with current location.
   */
  async function executeJumpSequence(route) {
    _addMessage('message:jump_planner.sequence_start', { destinationId: route[route.length - 1] });
    _addMessage('message:jump_planner.route_display', { route: route.join(' → ') });

    _startAction();

    for (let i = 1; i < route.length; i++) {
      const targetSystemId = route[i];
      _addMessage('message:jump_planner.jump_progress', {
        systemId: targetSystemId,
        current: i,
        total: route.length - 1
      });

      const result = await new Promise((resolve) => {
        _api.receive('jump-result', (jumpResult) => {
          resolve(jumpResult);
        });
        _api.send('jump-to-system', targetSystemId);
      });

      if (!result.success) {
        _addMessage('message:jump_planner.sequence_failed', {
          systemId: targetSystemId,
          reason: result.reason
        });
        _finishAction();
        return;
      }

      _addMessage('message:jump_planner.arrived', { systemId: targetSystemId });
      await _updateLocationDisplay();
      await _updateShipStatus();

      if (i < route.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    _addMessage('message:jump_planner.sequence_complete', { destinationId: route[route.length - 1] });
    _finishAction();
  }

  /**
   * Render dynamic action buttons based on the current location state.
   * Creates jump buttons for connected systems and dock/land/trade/takeoff
   * buttons based on available objects and player status.
   * @param {Object} locationState - Current location state from the game.
   */
  function updateAvailableActions(locationState) {
    const jumpButtons = document.getElementById('jump-buttons');
    const localButtons = document.getElementById('local-buttons');

    jumpButtons.innerHTML = '';
    localButtons.innerHTML = '';

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

    window.logger.debug('[DEBUG updateAvailableActions] Objects in current system:', locationState.objects.map(obj => ({ id: obj.id, name: obj.name, type: obj.type, className: obj.className })));

    if (isDocked || isLanded) {
      const currentObjectId = isDocked ? locationState.playerState.dockedAt : locationState.playerState.landedOn;
      const currentObject = locationState.objects.find(obj => obj.id === currentObjectId);

      if (isLanded && currentObject && currentObject.capabilities?.market) {
        const tradeButton = document.createElement('button');
        tradeButton.className = 'action-btn';
        tradeButton.dataset.action = 'trade';
        tradeButton.textContent = 'Trade';
        tradeButton.addEventListener('click', () => _openTradeModal(currentObject));
        localButtons.appendChild(tradeButton);
      }

      const takeOffButton = document.createElement('button');
      takeOffButton.className = 'action-btn';
      takeOffButton.dataset.action = 'takeoff';
      takeOffButton.textContent = 'Take Off';
      takeOffButton.addEventListener('click', handleTakeOff);
      localButtons.appendChild(takeOffButton);
    } else {
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
          window.logger.debug('[DEBUG updateAvailableActions] Creating land button for:', { id: obj.id, name: obj.name, type: obj.type, className: obj.className });
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
  }

  /**
   * Parse and execute a typed command from the game console.
   * Handles numeric system IDs, jump commands, dock/land shortcuts,
   * and button label matching.
   * @param {string} rawCommand - Raw command text from the input field.
   */
  async function executeInputCommand(rawCommand) {
    const normalizedCommand = _commandParser.normalizeCommandText(rawCommand);
    if (!normalizedCommand) {
      return;
    }

    const numericSystemId = _commandParser.parseNumericSystemId(normalizedCommand);
    if (numericSystemId !== null) {
      await offerRouteAndJump(numericSystemId);
      return;
    }

    const canonicalCommand = _commandParser.applyAlias(normalizedCommand, _commandAliases);
    const jumpTargetSystemId = _commandParser.parseJumpSystemId(canonicalCommand);
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
      return _commandParser.normalizeCommandText(button.textContent) === canonicalCommand;
    });
    if (executeCommandButton(exactMatch)) {
      return;
    }

    const labels = commandButtons.map((button) => button.textContent);
    const uniqueMatchLabel = _commandParser.resolveUniqueFirstWord(canonicalCommand, labels);
    if (uniqueMatchLabel) {
      const uniqueMatchButton = commandButtons.find((button) => {
        return _commandParser.normalizeCommandText(button.textContent) === uniqueMatchLabel;
      });
      if (executeCommandButton(uniqueMatchButton)) {
        return;
      }
    }

    _addMessage('message:commands.unknown', { command: rawCommand.trim() });
  }

  const api = {
    init,
    setCommandInputBusy,
    getCommandButtons,
    executeCommandButton,
    executeLocalActionShortcut,
    handleJump,
    handleDock,
    handleLand,
    handleTakeOff,
    offerRouteAndJump,
    executeJumpSequence,
    updateAvailableActions,
    executeInputCommand
  };

  if (typeof window !== 'undefined') {
    window.navigationHandlers = api;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
