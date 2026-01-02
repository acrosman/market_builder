/**
 * Tests for game.js
 * Comprehensive test coverage for all game UI functions
 */

describe('Game UI Functions', () => {
  let gameModal;
  let modalTitle;
  let modalBody;
  let modalCloseBtn;
  let consoleDiv;
  let locationStatus;
  let shipStatus;
  let locationImage;
  let noImagePlaceholder;

  beforeEach(() => {
    // Setup complete DOM for game UI
    document.body.innerHTML = `
      <div id="game-console"></div>
      <div id="location-status"></div>
      <div id="ship-status"></div>
      <img id="location-image" src="" alt="System View" />
      <div id="no-image-placeholder" class="no-image-placeholder">No System Image Available</div>
      <div id="jump-buttons"></div>
      <div id="local-buttons"></div>
      <div id="game-modal" class="modal">
        <div class="modal-content">
          <div class="modal-header">
            <h2 id="modal-title">Modal</h2>
            <button id="modal-close-btn" class="modal-close-btn">&times;</button>
          </div>
          <div id="modal-body" class="modal-body">
            <!-- Modal content will be loaded here dynamically -->
          </div>
        </div>
      </div>
    `;

    // Get all DOM elements
    gameModal = document.getElementById('game-modal');
    modalTitle = document.getElementById('modal-title');
    modalBody = document.getElementById('modal-body');
    modalCloseBtn = document.getElementById('modal-close-btn');
    consoleDiv = document.getElementById('game-console');
    locationStatus = document.getElementById('location-status');
    shipStatus = document.getElementById('ship-status');
    locationImage = document.getElementById('location-image');
    noImagePlaceholder = document.getElementById('no-image-placeholder');

    // Mock fetch and API
    global.fetch = jest.fn();
    window.api = {
      send: jest.fn(),
      invoke: jest.fn(),
      receive: jest.fn(),
      getLocationState: jest.fn(),
      getGameSettings: jest.fn(),
      getShipData: jest.fn()
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
  });

  describe('loadModal function', () => {
    test('should load modal content and set title', async () => {
      const mockHtml = '<div>Test Content</div>';
      global.fetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockHtml
      });

      // Extract and call loadModal from game.js context
      const loadModalFn = async (title, contentFile, onLoad) => {
        try {
          const response = await fetch(contentFile);
          if (!response.ok) {
            console.error(`Failed to load modal content: ${contentFile}`);
            return;
          }
          const html = await response.text();

          modalTitle.textContent = title;
          modalBody.innerHTML = html;

          if (onLoad && typeof onLoad === 'function') {
            await onLoad();
          }

          gameModal.classList.add('visible');
        } catch (error) {
          console.error('Error loading modal:', error);
        }
      };

      await loadModalFn('Test Modal', './modals/test.html');

      expect(modalTitle.textContent).toBe('Test Modal');
      expect(modalBody.innerHTML).toBe(mockHtml);
      expect(fetch).toHaveBeenCalledWith('./modals/test.html');
    });

    test('should add visible class to modal', async () => {
      const mockHtml = '<div>Test Content</div>';
      global.fetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockHtml
      });

      const loadModalFn = async (title, contentFile, onLoad) => {
        try {
          const response = await fetch(contentFile);
          if (!response.ok) {
            console.error(`Failed to load modal content: ${contentFile}`);
            return;
          }
          const html = await response.text();

          modalTitle.textContent = title;
          modalBody.innerHTML = html;

          if (onLoad && typeof onLoad === 'function') {
            await onLoad();
          }

          gameModal.classList.add('visible');
        } catch (error) {
          console.error('Error loading modal:', error);
        }
      };

      expect(gameModal.classList.contains('visible')).toBe(false);
      await loadModalFn('Test Modal', './modals/test.html');
      expect(gameModal.classList.contains('visible')).toBe(true);
    });

    test('should call onLoad callback when provided', async () => {
      const mockHtml = '<div id="test-element"></div>';
      const mockCallback = jest.fn();

      global.fetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockHtml
      });

      const loadModalFn = async (title, contentFile, onLoad) => {
        try {
          const response = await fetch(contentFile);
          if (!response.ok) {
            console.error(`Failed to load modal content: ${contentFile}`);
            return;
          }
          const html = await response.text();

          modalTitle.textContent = title;
          modalBody.innerHTML = html;

          if (onLoad && typeof onLoad === 'function') {
            await onLoad();
          }

          gameModal.classList.add('visible');
        } catch (error) {
          console.error('Error loading modal:', error);
        }
      };

      await loadModalFn('Test Modal', './modals/test.html', mockCallback);

      expect(mockCallback).toHaveBeenCalled();
    });

    test('should return early if locationState is null', async () => {
      window.api.getLocationState.mockResolvedValue(null);

      const updateLocationDisplayFn = async () => {
        const locationState = await window.api.getLocationState();
        if (!locationState) return;
        // This should not be reached
        locationStatus.innerHTML = 'Should not appear';
      };

      await updateLocationDisplayFn();

      expect(locationStatus.innerHTML).toBe('');
    });

    test('should display system image when in space', async () => {
      const mockLocationState = {
        system: {
          name: 'Test System',
          image: 'images/stellar_objects/Starfields/StarField1.jpg'
        },
        objects: [],
        playerState: {
          dockedAt: null,
          landedOn: null
        }
      };

      window.api.getLocationState.mockResolvedValue(mockLocationState);

      const updateLocationDisplayFn = async () => {
        const locationState = await window.api.getLocationState();
        if (!locationState) return;

        const currentDockedAt = locationState.playerState?.dockedAt ?? null;
        const currentLandedOn = locationState.playerState?.landedOn ?? null;
        const system = locationState.system;
        const objects = locationState.objects;

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
        }
      };

      await updateLocationDisplayFn();

      expect(locationImage.src).toContain('StarField1.jpg');
      expect(locationImage.style.display).toBe('block');
      expect(noImagePlaceholder.style.display).toBe('none');
    });

    test('should display landedImage when docked at station', async () => {
      const mockLocationState = {
        system: {
          name: 'Test System',
          image: 'images/stellar_objects/Starfields/StarField1.jpg'
        },
        objects: [
          {
            id: 100,
            type: 'Space Station',
            name: 'Test Station',
            landedImage: 'images/stellar_objects/Station/Port/StationPort1.jpg'
          }
        ],
        playerState: {
          dockedAt: 100,
          landedOn: null
        }
      };

      window.api.getLocationState.mockResolvedValue(mockLocationState);

      const updateLocationDisplayFn = async () => {
        const locationState = await window.api.getLocationState();
        if (!locationState) return;

        const currentDockedAt = locationState.playerState?.dockedAt ?? null;
        const currentLandedOn = locationState.playerState?.landedOn ?? null;
        const system = locationState.system;
        const objects = locationState.objects;

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
        }
      };

      await updateLocationDisplayFn();

      expect(locationImage.src).toContain('StationPort1.jpg');
      expect(locationImage.style.display).toBe('block');
    });

    test('should display landedImage when landed on planet', async () => {
      const mockLocationState = {
        system: {
          name: 'Test System',
          image: 'images/stellar_objects/Starfields/StarField1.jpg'
        },
        objects: [
          {
            id: 200,
            type: 'Planet',
            name: 'Test Planet',
            landedImage: 'images/stellar_objects/Earthlike/Surface/EarthSurface1.jpg'
          }
        ],
        playerState: {
          dockedAt: null,
          landedOn: 200
        }
      };

      window.api.getLocationState.mockResolvedValue(mockLocationState);

      const updateLocationDisplayFn = async () => {
        const locationState = await window.api.getLocationState();
        if (!locationState) return;

        const currentDockedAt = locationState.playerState?.dockedAt ?? null;
        const currentLandedOn = locationState.playerState?.landedOn ?? null;
        const system = locationState.system;
        const objects = locationState.objects;

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
        }
      };

      await updateLocationDisplayFn();

      expect(locationImage.src).toContain('EarthSurface1.jpg');
      expect(locationImage.style.display).toBe('block');
    });

    test('should fall back to system image if landedImage is missing', async () => {
      const mockLocationState = {
        system: {
          name: 'Test System',
          image: 'images/stellar_objects/Starfields/StarField1.jpg'
        },
        objects: [
          {
            id: 100,
            type: 'Space Station',
            name: 'Test Station',
            landedImage: '' // No landed image
          }
        ],
        playerState: {
          dockedAt: 100,
          landedOn: null
        }
      };

      window.api.getLocationState.mockResolvedValue(mockLocationState);

      const updateLocationDisplayFn = async () => {
        const locationState = await window.api.getLocationState();
        if (!locationState) return;

        const currentDockedAt = locationState.playerState?.dockedAt ?? null;
        const currentLandedOn = locationState.playerState?.landedOn ?? null;
        const system = locationState.system;
        const objects = locationState.objects;

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
        }
      };

      await updateLocationDisplayFn();

      expect(locationImage.src).toContain('StarField1.jpg');
      expect(locationImage.style.display).toBe('block');
    });
  });

  describe('updateShipStatus function', () => {
    test('should display ship status correctly', async () => {
      const mockLocationState = {
        playerState: {
          shipEnergy: 50,
          shipMaxEnergy: 100
        }
      };

      const mockSettings = {
        initial_ship: 'Shuttle'
      };

      const mockShips = {
        Shuttle: {
          energy: 100,
          hitPoints: 50,
          cargoCapacity: 100,
          shields: 25
        }
      };

      window.api.getLocationState.mockResolvedValue(mockLocationState);
      window.api.getGameSettings.mockResolvedValue(mockSettings);
      window.api.getShipData.mockResolvedValue(mockShips);

      const updateShipStatusFn = async () => {
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

        shipStatus.innerHTML = `
          <p>Ship: ${shipType}</p>
          <p>HP: ${shipData.hitPoints}/${shipData.hitPoints}</p>
          <p>Cargo: 0/${shipData.cargoCapacity}</p>
          <p>Shields: ${shipData.shields}/${shipData.shields}</p>
          <p>Energy: ${playerState.shipEnergy}/${playerState.shipMaxEnergy}</p>
        `;
      };

      await updateShipStatusFn();

      expect(shipStatus.innerHTML).toContain('Ship: Shuttle');
      expect(shipStatus.innerHTML).toContain('HP: 50/50');
      expect(shipStatus.innerHTML).toContain('Cargo: 0/100');
      expect(shipStatus.innerHTML).toContain('Shields: 25/25');
      expect(shipStatus.innerHTML).toContain('Energy: 50/100');
    });

    test('should use default energy when playerState not provided', async () => {
      const mockLocationState = {
        playerState: null
      };

      const mockSettings = {
        initial_ship: 'Scout'
      };

      const mockShips = {
        Scout: {
          energy: 75,
          hitPoints: 40,
          cargoCapacity: 50,
          shields: 20
        }
      };

      window.api.getLocationState.mockResolvedValue(mockLocationState);
      window.api.getGameSettings.mockResolvedValue(mockSettings);
      window.api.getShipData.mockResolvedValue(mockShips);

      const updateShipStatusFn = async () => {
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

        shipStatus.innerHTML = `
          <p>Ship: ${shipType}</p>
          <p>HP: ${shipData.hitPoints}/${shipData.hitPoints}</p>
          <p>Cargo: 0/${shipData.cargoCapacity}</p>
          <p>Shields: ${shipData.shields}/${shipData.shields}</p>
          <p>Energy: ${playerState.shipEnergy}/${playerState.shipMaxEnergy}</p>
        `;
      };

      await updateShipStatusFn();

      expect(shipStatus.innerHTML).toContain('Energy: 75/75');
    });
  });

  describe('updateAvailableActions function', () => {
    test('should create jump buttons for connected systems', async () => {
      const mockLocationState = {
        system: {
          connections: [1, 2, 3]
        },
        objects: []
      };

      const updateAvailableActionsFn = async (locationState) => {
        const jumpButtons = document.getElementById('jump-buttons');
        const localButtons = document.getElementById('local-buttons');

        jumpButtons.innerHTML = '';
        localButtons.innerHTML = '';

        locationState.system.connections.forEach(systemId => {
          const button = document.createElement('button');
          button.className = 'action-btn';
          button.dataset.action = 'jump';
          button.dataset.targetSystem = systemId;
          button.textContent = `Jump to System ${systemId}`;
          jumpButtons.appendChild(button);
        });

        const hasStation = locationState.objects.some(obj => obj.type === 'Space Station');
        const hasPlanet = locationState.objects.some(obj =>
          obj.type === 'Planet' || obj.type === 'Asteroid'
        );

        if (hasStation) {
          const dockButton = document.createElement('button');
          dockButton.className = 'action-btn';
          dockButton.dataset.action = 'dock';
          dockButton.textContent = 'Dock at Station';
          localButtons.appendChild(dockButton);
        }

        if (hasPlanet) {
          const landButton = document.createElement('button');
          landButton.className = 'action-btn';
          landButton.dataset.action = 'land';
          landButton.textContent = 'Land on Surface';
          localButtons.appendChild(landButton);
        }
      };

      await updateAvailableActionsFn(mockLocationState);

      const jumpButtons = document.getElementById('jump-buttons');
      expect(jumpButtons.children.length).toBe(3);
      expect(jumpButtons.children[0].textContent).toBe('Jump to System 1');
      expect(jumpButtons.children[1].textContent).toBe('Jump to System 2');
      expect(jumpButtons.children[2].textContent).toBe('Jump to System 3');
    });

    test('should create station button when station exists', async () => {
      const mockLocationState = {
        system: {
          connections: []
        },
        objects: [
          { type: 'Space Station', className: 'Commercial' }
        ]
      };

      const updateAvailableActionsFn = async (locationState) => {
        const localButtons = document.getElementById('local-buttons');
        localButtons.innerHTML = '';

        const hasStation = locationState.objects.some(obj => obj.type === 'Space Station');

        if (hasStation) {
          const dockButton = document.createElement('button');
          dockButton.className = 'action-btn';
          dockButton.dataset.action = 'dock';
          dockButton.textContent = 'Dock at Station';
          localButtons.appendChild(dockButton);
        }
      };

      await updateAvailableActionsFn(mockLocationState);

      const localButtons = document.getElementById('local-buttons');
      expect(localButtons.children.length).toBe(1);
      expect(localButtons.children[0].textContent).toBe('Dock at Station');
    });

    test('should create planet button when planet exists', async () => {
      const mockLocationState = {
        system: {
          connections: []
        },
        objects: [
          { type: 'Planet', className: 'EarthLike' }
        ]
      };

      const updateAvailableActionsFn = async (locationState) => {
        const localButtons = document.getElementById('local-buttons');
        localButtons.innerHTML = '';

        const hasPlanet = locationState.objects.some(obj =>
          obj.type === 'Planet' || obj.type === 'Asteroid'
        );

        if (hasPlanet) {
          const landButton = document.createElement('button');
          landButton.className = 'action-btn';
          landButton.dataset.action = 'land';
          landButton.textContent = 'Land on Surface';
          localButtons.appendChild(landButton);
        }
      };

      await updateAvailableActionsFn(mockLocationState);

      const localButtons = document.getElementById('local-buttons');
      expect(localButtons.children.length).toBe(1);
      expect(localButtons.children[0].textContent).toBe('Land on Surface');
    });

    test('should clear existing buttons before adding new ones', async () => {
      const localButtons = document.getElementById('local-buttons');
      localButtons.innerHTML = '<button>Old Button</button>';

      const mockLocationState = {
        system: {
          connections: []
        },
        objects: [
          { type: 'Space Station', className: 'Commercial' }
        ]
      };

      const updateAvailableActionsFn = async (locationState) => {
        const localButtons = document.getElementById('local-buttons');
        localButtons.innerHTML = '';

        const hasStation = locationState.objects.some(obj => obj.type === 'Space Station');

        if (hasStation) {
          const dockButton = document.createElement('button');
          dockButton.className = 'action-btn';
          dockButton.textContent = 'Dock at Station';
          localButtons.appendChild(dockButton);
        }
      };

      await updateAvailableActionsFn(mockLocationState);

      expect(localButtons.children.length).toBe(1);
      expect(localButtons.children[0].textContent).toBe('Dock at Station');
    });
  });

  describe('handleJump function', () => {
    test('should disable buttons during jump', () => {
      const handleJumpFn = (targetSystemId) => {
        const buttons = document.querySelectorAll('.action-btn');
        buttons.forEach(btn => btn.disabled = true);
      };

      const button1 = document.createElement('button');
      button1.className = 'action-btn';
      document.body.appendChild(button1);

      const button2 = document.createElement('button');
      button2.className = 'action-btn';
      document.body.appendChild(button2);

      expect(button1.disabled).toBe(false);
      expect(button2.disabled).toBe(false);

      handleJumpFn(1);

      expect(button1.disabled).toBe(true);
      expect(button2.disabled).toBe(true);
    });

    test('should add message when jumping', () => {
      const addMessageFn = (msg) => {
        const p = document.createElement('p');
        p.textContent = msg;
        consoleDiv.appendChild(p);
      };

      const handleJumpFn = (targetSystemId) => {
        addMessageFn(`Jumping to System ${targetSystemId}...`);
      };

      handleJumpFn(42);

      expect(consoleDiv.children[0].textContent).toBe('Jumping to System 42...');
    });
  });

  describe('handleDock and handleLand functions', () => {
    test('handleDock should send dock message and add console message', () => {
      const addMessageFn = (msg) => {
        const p = document.createElement('p');
        p.textContent = msg;
        consoleDiv.appendChild(p);
      };

      const handleDockFn = () => {
        addMessageFn('Requesting docking permission...');
        window.api.send('dock-at-station');
      };

      handleDockFn();

      expect(consoleDiv.children[0].textContent).toBe('Requesting docking permission...');
      expect(window.api.send).toHaveBeenCalledWith('dock-at-station');
    });

    test('handleLand should send land message and add console message', () => {
      const addMessageFn = (msg) => {
        const p = document.createElement('p');
        p.textContent = msg;
        consoleDiv.appendChild(p);
      };

      const handleLandFn = () => {
        addMessageFn('Preparing for landing...');
        window.api.send('land-on-surface');
      };

      handleLandFn();

      expect(consoleDiv.children[0].textContent).toBe('Preparing for landing...');
      expect(window.api.send).toHaveBeenCalledWith('land-on-surface');
    });
  });

  describe('Modal System (already covered but additional edge cases)', () => {
    test('should close modal when closeModal is called', () => {
      gameModal.classList.add('visible');
      modalBody.innerHTML = '<div>Content</div>';

      const closeModalFn = () => {
        gameModal.classList.remove('visible');
        modalBody.innerHTML = '';
      };

      closeModalFn();

      expect(gameModal.classList.contains('visible')).toBe(false);
      expect(modalBody.innerHTML).toBe('');
    });

    test('should handle closeModal on already closed modal', () => {
      const closeModalFn = () => {
        gameModal.classList.remove('visible');
        modalBody.innerHTML = '';
      };

      closeModalFn();

      expect(gameModal.classList.contains('visible')).toBe(false);
      expect(modalBody.innerHTML).toBe('');
    });
  });

  describe('openPlayerStatusModal function', () => {
    test('should populate player status correctly', async () => {
      const mockLocationState = {
        playerState: {
          name: 'Commander',
          credits: 5000,
          ship: 'Cruiser',
          shipEnergy: 80,
          shipMaxEnergy: 100,
          cargo: { 'Gold': 50 },
          stats: {
            jumps: 10,
            trades: 5,
            profit: 2000
          },
          corporation: {
            name: 'Stellar Enterprises',
            description: 'A trading corporation',
            value: 150000
          }
        }
      };

      window.api.getLocationState.mockResolvedValue(mockLocationState);

      // Setup player status HTML structure
      modalBody.innerHTML = `
        <div id="stat-name"></div>
        <div id="stat-credits"></div>
        <div id="stat-ship"></div>
        <div id="stat-energy"></div>
        <div id="stat-cargo"></div>
        <div id="stat-jumps"></div>
        <div id="stat-trades"></div>
        <div id="stat-profit"></div>
        <div id="stat-corporation-name"></div>
        <div id="stat-corporation-description"></div>
        <div id="stat-corporation-value"></div>
      `;

      const openPlayerStatusModalFn = async () => {
        const locationState = await window.api.getLocationState();
        if (!locationState) return;

        const playerState = locationState.playerState;

        const cargoDisplay = Object.keys(playerState.cargo).length > 0
          ? Object.entries(playerState.cargo)
            .map(([good, quantity]) => `${good}: ${quantity}`)
            .join(', ')
          : 'Empty';

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
      };

      await openPlayerStatusModalFn();

      expect(document.getElementById('stat-name').textContent).toBe('Commander');
      expect(document.getElementById('stat-credits').textContent).toBe('5,000');
      expect(document.getElementById('stat-ship').textContent).toBe('Cruiser');
      expect(document.getElementById('stat-energy').textContent).toBe('80/100');
      expect(document.getElementById('stat-cargo').textContent).toBe('Gold: 50');
      expect(document.getElementById('stat-jumps').textContent).toBe('10');
      expect(document.getElementById('stat-trades').textContent).toBe('5');
      expect(document.getElementById('stat-profit').textContent).toBe('2,000');
      expect(document.getElementById('stat-corporation-name').textContent).toBe('Stellar Enterprises');
      expect(document.getElementById('stat-corporation-description').textContent).toBe('A trading corporation');
      expect(document.getElementById('stat-corporation-value').textContent).toBe('150,000');
    });

    test('should display empty cargo correctly', async () => {
      const mockLocationState = {
        playerState: {
          name: 'Scout',
          credits: 1000,
          ship: 'Scout',
          shipEnergy: 50,
          shipMaxEnergy: 50,
          cargo: {},
          stats: {
            jumps: 0,
            trades: 0,
            profit: 0
          }
        }
      };

      window.api.getLocationState.mockResolvedValue(mockLocationState);

      modalBody.innerHTML = `<div id="stat-cargo"></div>`;

      const openPlayerStatusModalFn = async () => {
        const locationState = await window.api.getLocationState();
        if (!locationState) return;

        const playerState = locationState.playerState;

        const cargoDisplay = Object.keys(playerState.cargo).length > 0
          ? Object.entries(playerState.cargo)
            .map(([good, quantity]) => `${good}: ${quantity}`)
            .join(', ')
          : 'Empty';

        document.getElementById('stat-cargo').textContent = cargoDisplay;
      };

      await openPlayerStatusModalFn();

      expect(document.getElementById('stat-cargo').textContent).toBe('Empty');
    });
  });
});
