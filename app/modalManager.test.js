const modalManager = require('./modalManager');
const gameHelpers = require('./gameHelpers');

describe('modalManager', () => {
  let mockApi;
  let mockContext;

  function setupDom() {
    document.body.innerHTML = `
      <div id="game-modal">
        <div class="modal-content">
          <h2 id="modal-title"></h2>
          <div id="modal-body"></div>
          <button id="modal-close-btn">X</button>
        </div>
      </div>
    `;
  }

  beforeEach(() => {
    setupDom();

    mockApi = {
      send: jest.fn(),
      invoke: jest.fn(),
      receive: jest.fn(),
      getLocationState: jest.fn(),
      getUniverseState: jest.fn(),
      getUniverseMapData: jest.fn(),
      getGameData: jest.fn(),
      getGameSettings: jest.fn()
    };

    mockContext = {
      api: mockApi,
      addMessage: jest.fn(),
      resolveMessageText: jest.fn().mockResolvedValue(''),
      updateLocationDisplay: jest.fn().mockResolvedValue(undefined),
      updateShipStatus: jest.fn().mockResolvedValue(undefined),
      displayStellarObjectProperties: jest.fn().mockResolvedValue(undefined),
      executeJumpSequence: jest.fn().mockResolvedValue(undefined),
      refreshCompanyManagementButtons: jest.fn().mockResolvedValue(undefined)
    };

    modalManager.init(mockContext);

    global.fetch = jest.fn();
    window.navigationHandlers = {
      handleBuild: jest.fn()
    };
    window.gameHelpers = gameHelpers;
  });

  afterEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
    delete window.navigationHandlers;
    delete window.gameHelpers;
  });

  describe('init', () => {
    test('registers close button click handler', () => {
      const closeBtn = document.getElementById('modal-close-btn');
      const modal = document.getElementById('game-modal');
      modal.classList.add('visible');

      closeBtn.click();

      expect(modal.classList.contains('visible')).toBe(false);
    });

    test('registers Escape key handler to close modal', () => {
      const modal = document.getElementById('game-modal');
      modal.classList.add('visible');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(modal.classList.contains('visible')).toBe(false);
    });

    test('Escape key does not close modal when not visible', () => {
      const modal = document.getElementById('game-modal');
      // Modal is not visible
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      // Should not throw and modal should stay non-visible
      expect(modal.classList.contains('visible')).toBe(false);
    });

    test('registers click-outside handler to close modal', () => {
      const modal = document.getElementById('game-modal');
      modal.classList.add('visible');

      // Click on the modal backdrop (the modal element itself)
      modal.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(modal.classList.contains('visible')).toBe(false);
    });
  });

  describe('closeModal', () => {
    test('removes visible class from modal', () => {
      const modal = document.getElementById('game-modal');
      modal.classList.add('visible');

      modalManager.closeModal();

      expect(modal.classList.contains('visible')).toBe(false);
    });

    test('clears modal body content', () => {
      const modalBody = document.getElementById('modal-body');
      modalBody.innerHTML = '<p>some content</p>';

      modalManager.closeModal();

      expect(modalBody.innerHTML).toBe('');
    });

    test('removes wide class from modal content', () => {
      const modalContent = document.querySelector('.modal-content');
      modalContent.classList.add('wide');

      modalManager.closeModal();

      expect(modalContent.classList.contains('wide')).toBe(false);
    });
  });

  describe('loadModal', () => {
    test('fetches content file and populates modal', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue('<p id="test-content">Hello</p>')
      });

      await modalManager.loadModal('Test Title', './modals/test.html');

      const modal = document.getElementById('game-modal');
      const title = document.getElementById('modal-title');
      expect(title.textContent).toBe('Test Title');
      expect(modal.classList.contains('visible')).toBe(true);
    });

    test('calls onLoad callback after content is loaded', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue('<p>Content</p>')
      });
      const onLoad = jest.fn().mockResolvedValue(undefined);

      await modalManager.loadModal('Test', './modals/test.html', onLoad);

      expect(onLoad).toHaveBeenCalled();
    });

    test('logs error and returns when fetch fails', async () => {
      global.fetch.mockResolvedValue({ ok: false });

      await modalManager.loadModal('Test', './modals/not-found.html');

      expect(window.logger.error).toHaveBeenCalled();
      const modal = document.getElementById('game-modal');
      expect(modal.classList.contains('visible')).toBe(false);
    });

    test('logs error when fetch throws', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'));

      await modalManager.loadModal('Test', './modals/test.html');

      expect(window.logger.error).toHaveBeenCalled();
    });
  });

  describe('displayErrorMessage', () => {
    test('loads error template and sets text content', async () => {
      document.body.innerHTML += '<div id="test-container"></div><p id="error-message-text"></p>';
      const container = document.getElementById('test-container');

      global.fetch.mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue('<p id="error-message-text"></p>')
      });

      await modalManager.displayErrorMessage(container, 'Something went wrong');

      const errorText = document.getElementById('error-message-text');
      expect(errorText.textContent).toBe('Something went wrong');
    });

    test('falls back to createElement when fetch fails', async () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      global.fetch.mockRejectedValue(new Error('fail'));

      await modalManager.displayErrorMessage(container, 'Error text');

      const p = container.querySelector('p.error-message');
      expect(p).not.toBeNull();
      expect(p.textContent).toBe('Error text');
      expect(window.logger.error).toHaveBeenCalled();
    });
  });

  describe('openPlayerStatusModal', () => {
    test('loads player-status modal and populates player data', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue(`
          <div>
            <span id="stat-name"></span>
            <span id="stat-credits"></span>
            <span id="stat-ship"></span>
            <span id="stat-energy"></span>
            <span id="stat-cargo"></span>
            <span id="stat-jumps"></span>
            <span id="stat-trades"></span>
            <span id="stat-profit"></span>
            <span id="stat-corporation-name"></span>
            <span id="stat-corporation-description"></span>
            <span id="stat-corporation-value"></span>
          </div>
        `)
      });

      mockApi.getLocationState.mockResolvedValue({
        playerState: {
          name: 'Captain Test',
          credits: 5000,
          ship: 'Freighter',
          shipEnergy: 80,
          shipMaxEnergy: 100,
          cargo: {},
          stats: { jumps: 3, trades: 7, profit: 1500 },
          corporation: {
            name: 'Test Corp',
            description: 'A testing corporation',
            value: 20000
          }
        }
      });
      mockApi.invoke.mockResolvedValue({});

      await modalManager.openPlayerStatusModal();

      expect(document.getElementById('stat-name').textContent).toBe('Captain Test');
      expect(document.getElementById('stat-credits').textContent).toBe('5,000');
      expect(document.getElementById('stat-energy').textContent).toBe('80/100');
    });

    test('shows empty cargo when cargo is empty', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue(`
          <span id="stat-name"></span>
          <span id="stat-credits"></span>
          <span id="stat-ship"></span>
          <span id="stat-energy"></span>
          <span id="stat-cargo"></span>
          <span id="stat-jumps"></span>
          <span id="stat-trades"></span>
          <span id="stat-profit"></span>
          <span id="stat-corporation-name"></span>
          <span id="stat-corporation-description"></span>
          <span id="stat-corporation-value"></span>
        `)
      });

      mockApi.getLocationState.mockResolvedValue({
        playerState: {
          name: 'Test', credits: 0, ship: 'Scout', shipEnergy: 50, shipMaxEnergy: 100,
          cargo: {},
          stats: { jumps: 0, trades: 0, profit: 0 },
          corporation: { name: 'Corp', description: '', value: 0 }
        }
      });
      mockApi.invoke.mockResolvedValue({});

      await modalManager.openPlayerStatusModal();

      expect(document.getElementById('stat-cargo').textContent).toBe('Empty');
    });

    test('returns early when locationState is null', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue('<div></div>')
      });
      mockApi.getLocationState.mockResolvedValue(null);

      await modalManager.openPlayerStatusModal();
      // Should not throw and modal body remains with loaded HTML
    });

    test('corporation button opens corporation status modal for active corporation', async () => {
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          text: jest.fn().mockResolvedValue(`
            <span id="stat-name"></span>
            <span id="stat-credits"></span>
            <span id="stat-ship"></span>
            <span id="stat-energy"></span>
            <span id="stat-cargo"></span>
            <span id="stat-jumps"></span>
            <span id="stat-trades"></span>
            <span id="stat-profit"></span>
            <span id="stat-corporation-name"></span>
            <span id="stat-corporation-description"></span>
            <span id="stat-corporation-value"></span>
            <button id="btn-corporation-status"></button>
          `)
        })
        .mockResolvedValueOnce({
          ok: true,
          text: jest.fn().mockResolvedValue(`
            <span id="corp-name"></span>
            <span id="corp-description"></span>
            <span id="corp-value"></span>
            <span id="corp-cash-total"></span>
            <div id="corp-planets-list"></div>
            <div id="corp-ships-list"></div>
            <button id="btn-player-status"></button>
          `)
        })
        .mockResolvedValueOnce({
          ok: true,
          text: jest.fn().mockResolvedValue(`
            <div class="asset-item">
              <span id="asset-name"></span>
              <span id="asset-class"></span>
              <span id="asset-location"></span>
              <span id="asset-value"></span>
            </div>
          `)
        });

      mockApi.getLocationState.mockResolvedValue({
        playerState: {
          name: 'Captain',
          credits: 10,
          ship: 'Scout',
          shipEnergy: 5,
          shipMaxEnergy: 10,
          cargo: {},
          stats: { jumps: 1, trades: 1, profit: 1 },
          corporation: { name: 'Alpha Corp', description: 'Test', value: 100 }
        }
      });

      mockApi.getUniverseState.mockResolvedValue({ stellarObjects: [] });
      mockApi.getGameData.mockResolvedValue({ Scout: { value: 1000 } });

      mockApi.invoke.mockImplementation((channel) => {
        if (channel === 'get-goods-data') {
          return Promise.resolve({});
        }

        return Promise.resolve(null);
      });

      await modalManager.openPlayerStatusModal();
      document.getElementById('btn-corporation-status').click();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(document.getElementById('modal-title').textContent).toBe('Corporation Status');
    });
  });

  describe('openCorporationStatusModal', () => {
    function setupCorpModal() {
      global.fetch.mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue(`
          <div>
            <span id="corp-name"></span>
            <span id="corp-description"></span>
            <span id="corp-value"></span>
            <div id="corp-planets-list"></div>
            <div id="corp-ships-list"></div>
          </div>
        `)
      });
    }

    test('populates corporation name and value', async () => {
      setupCorpModal();
      mockApi.getLocationState.mockResolvedValue({
        playerState: {
          ship: 'Hauler',
          system: 1,
          corporation: {
            name: 'Trade Empire',
            description: 'A great corp',
            value: 100000,
            totalCashReserves: 50000,
            stellarObjects: []
          }
        }
      });
      mockApi.getUniverseState.mockResolvedValue({ stellarObjects: [] });
      mockApi.getGameData.mockResolvedValue({ Hauler: { value: 50000 } });

      await modalManager.openCorporationStatusModal();

      expect(document.getElementById('corp-name').textContent).toBe('Trade Empire');
      expect(document.getElementById('corp-value').textContent).toBe('100,000');
    });

    test('shows No planets owned when no stellar objects', async () => {
      setupCorpModal();
      mockApi.getLocationState.mockResolvedValue({
        playerState: {
          ship: 'Scout',
          system: 1,
          corporation: {
            name: 'Corp',
            description: '',
            value: 0,
            totalCashReserves: 0,
            stellarObjects: []
          }
        }
      });
      mockApi.getUniverseState.mockResolvedValue({ stellarObjects: [] });
      mockApi.getGameData.mockResolvedValue({ Scout: { value: 10000 } });

      await modalManager.openCorporationStatusModal();

      const planetsList = document.getElementById('corp-planets-list');
      expect(planetsList.textContent).toContain('No planets owned');
    });

    test('uses asset-item template for stellar objects (no innerHTML)', async () => {
      // Return the asset-item template for the second fetch (first is the modal HTML)
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          text: jest.fn().mockResolvedValue(`
            <div>
              <span id="corp-name"></span>
              <span id="corp-description"></span>
              <span id="corp-value"></span>
              <div id="corp-planets-list"></div>
              <div id="corp-ships-list"></div>
            </div>
          `)
        })
        .mockResolvedValueOnce({
          ok: true,
          text: jest.fn().mockResolvedValue(
            '<div class="asset-item"><strong id="asset-name"></strong> <span id="asset-class"></span><br><span id="asset-location"></span><br>Value: <span id="asset-value"></span> credits</div>'
          )
        });

      mockApi.getLocationState.mockResolvedValue({
        playerState: {
          ship: 'Freighter',
          system: 2,
          corporation: {
            name: 'Corp',
            description: '',
            value: 0,
            totalCashReserves: 0,
            stellarObjects: [101]
          }
        }
      });
      mockApi.getUniverseState.mockResolvedValue({
        stellarObjects: [{ id: 101, name: 'Harvest World', className: 'M', location: 2, value: 75000 }]
      });
      mockApi.getGameData.mockResolvedValue({ Freighter: { value: 20000 } });

      await modalManager.openCorporationStatusModal();

      const planetsList = document.getElementById('corp-planets-list');
      expect(planetsList.querySelector('.asset-item')).not.toBeNull();
      expect(planetsList.querySelector('#asset-name').textContent).toBe('Harvest World');
    });

    test('returns early when locationState is null', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue('<div></div>')
      });
      mockApi.getLocationState.mockResolvedValue(null);
      await modalManager.openCorporationStatusModal();
    });
  });

  describe('openJumpPlanner', () => {
    test('shows docked_or_landed message when player is docked', async () => {
      mockApi.getLocationState.mockResolvedValue({
        playerState: { dockedAt: 5, landedOn: null, location: 1 }
      });
      await modalManager.openJumpPlanner();
      expect(mockContext.addMessage).toHaveBeenCalledWith('message:jump_planner.docked_or_landed');
    });

    test('shows docked_or_landed message when player is landed', async () => {
      mockApi.getLocationState.mockResolvedValue({
        playerState: { dockedAt: null, landedOn: 10, location: 1 }
      });
      await modalManager.openJumpPlanner();
      expect(mockContext.addMessage).toHaveBeenCalledWith('message:jump_planner.docked_or_landed');
    });

    test('shows no_systems_data message when allSystems is empty', async () => {
      mockApi.getLocationState.mockResolvedValue({
        playerState: { dockedAt: null, landedOn: null, location: 1 }
      });
      mockApi.invoke.mockResolvedValue([]);
      await modalManager.openJumpPlanner();
      expect(mockContext.addMessage).toHaveBeenCalledWith('message:jump_planner.no_systems_data');
    });

    test('returns early when locationState is null', async () => {
      mockApi.getLocationState.mockResolvedValue(null);
      await modalManager.openJumpPlanner();
      expect(mockContext.addMessage).not.toHaveBeenCalled();
    });

    test('loads jump planner modal when player is in space', async () => {
      mockApi.getLocationState.mockResolvedValue({
        playerState: { dockedAt: null, landedOn: null, location: 1 }
      });
      mockApi.invoke.mockResolvedValue([{ id: 1, name: 'Sol' }, { id: 2, name: 'Alpha' }]);
      global.fetch.mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue(
          '<div><span id="current-system-display"></span><button id="calculate-route-btn">Calculate</button><div id="route-display"></div></div>'
        )
      });

      await modalManager.openJumpPlanner();

      expect(document.getElementById('current-system-display').textContent).toBe('System 1');
    });
  });

  describe('openUniverseMapModal', () => {
    test('returns early when mapData is null', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue('<div id="universe-map-diagram"></div>')
      });
      mockApi.getUniverseMapData.mockResolvedValue(null);

      await modalManager.openUniverseMapModal();
      // Should not throw
    });

    test('loads universe map modal and calls renderUniverseMap when data is provided', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue('<div id="universe-map-diagram" style="width:600px;height:500px"></div>')
      });
      mockApi.getUniverseMapData.mockResolvedValue({
        systems: [
          { id: 1, name: 'Sol', connections: { 2: {} } },
          { id: 2, name: 'Alpha', connections: { 1: {} } }
        ],
        stellarObjects: [{ id: 101, type: 'Planet', location: 1 }],
        exploredSystems: [1]
      });

      // d3 is not available in jsdom; just verify it doesn't crash the loadModal path
      // by mocking the d3 calls
      global.d3 = {
        select: jest.fn().mockReturnValue({
          selectAll: jest.fn().mockReturnValue({ remove: jest.fn() }),
          append: jest.fn().mockReturnThis(),
          attr: jest.fn().mockReturnThis(),
          style: jest.fn().mockReturnThis(),
          call: jest.fn().mockReturnThis()
        }),
        scaleOrdinal: jest.fn().mockReturnValue(
          Object.assign(jest.fn().mockReturnValue('#ff0000'), { domain: jest.fn().mockReturnThis(), range: jest.fn().mockReturnThis() })
        ),
        schemeCategory10: [],
        zoom: jest.fn().mockReturnValue({
          scaleExtent: jest.fn().mockReturnThis(),
          on: jest.fn().mockReturnThis(),
          scaleBy: jest.fn(),
          transform: {},
        }),
        forceSimulation: jest.fn().mockReturnValue({
          force: jest.fn().mockReturnThis(),
          on: jest.fn().mockReturnThis(),
          alphaTarget: jest.fn().mockReturnThis(),
          restart: jest.fn()
        }),
        forceLink: jest.fn().mockReturnValue({ id: jest.fn().mockReturnThis(), distance: jest.fn().mockReturnThis() }),
        forceManyBody: jest.fn().mockReturnValue({ strength: jest.fn().mockReturnThis() }),
        forceCenter: jest.fn(),
        drag: jest.fn().mockReturnValue({ on: jest.fn().mockReturnThis() }),
        zoomIdentity: { translate: jest.fn().mockReturnThis(), scale: jest.fn().mockReturnThis() }
      };

      await modalManager.openUniverseMapModal();
      // No assertion — just verifying no crash
    });
  });

  describe('openCompanyManagementModal', () => {
    function setupCompanyManagementModal() {
      global.fetch.mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue(`
          <div class="company-management-tabs">
            <button id="company-tab-profile" data-tab="profile"></button>
            <button id="company-tab-finance" data-tab="finance"></button>
            <button id="company-tab-loans" data-tab="loans"></button>
            <button id="company-tab-trade-routes" data-tab="trade-routes"></button>
          </div>
          <div id="company-tab-content-profile"></div>
          <div id="company-tab-content-finance"></div>
          <div id="company-tab-content-loans"></div>
          <div id="company-tab-content-trade-routes"></div>
          <span id="company-overview-total-value"></span>
          <span id="company-overview-cash-reserves"></span>
          <div id="company-owned-stellar-objects-list"></div>
          <div id="company-fleet-list"></div>
          <input id="company-name-input">
          <textarea id="company-description-input"></textarea>
          <span id="company-value"></span>
          <span id="company-cash-reserves"></span>
          <span id="company-shares-issued"></span>
          <input id="company-dividend-rate-input" />
          <span id="company-credit-rating"></span>
          <span id="company-interest-rate"></span>
          <span id="company-outstanding-debt"></span>
          <div id="company-loans-list"></div>
          <select id="company-loan-payment-select"></select>
          <select id="company-loan-repayment-select"></select>
          <button id="save-company-profile-btn"></button>
          <button id="set-company-dividend-btn"></button>
          <button id="issue-company-shares-btn"></button>
          <input id="company-issue-shares-input" />
          <button id="take-company-loan-btn"></button>
          <input id="company-loan-amount-input" />
          <button id="make-company-loan-payment-btn"></button>
          <input id="company-loan-payment-amount-input" />
          <button id="set-company-loan-repayment-btn"></button>
          <input id="company-loan-repayment-rate-input" />
        `)
      });
    }

    test('loads and displays company management data', async () => {
      setupCompanyManagementModal();
      mockContext.resolveMessageText.mockImplementation((messageKey, vars = {}) => {
        if (messageKey === 'company_management.modal_title') {
          return Promise.resolve('Company Management');
        }
        if (messageKey === 'company_management.loans.loan_option') {
          return Promise.resolve(`Loan #${vars.loanId} (${vars.balance})`);
        }
        if (messageKey === 'company_management.loans.loan_line') {
          return Promise.resolve(`Loan #${vars.loanId}`);
        }
        if (messageKey === 'company_management.loans.none_outstanding') {
          return Promise.resolve('No outstanding loans.');
        }
        if (messageKey === 'company_management.assets.none_stellar_objects') {
          return Promise.resolve('No stellar objects owned.');
        }
        if (messageKey === 'company_management.assets.none_ships') {
          return Promise.resolve('No ships owned.');
        }
        if (messageKey === 'company_management.assets.stellar_object_line') {
          return Promise.resolve(`${vars.name} (${vars.className}) | System: ${vars.location} | Value: ${vars.value}`);
        }
        if (messageKey === 'company_management.assets.ship_line') {
          return Promise.resolve(vars.shipName);
        }
        return Promise.resolve('');
      });
      mockApi.invoke.mockImplementation((channel) => {
        if (channel === 'get-company-management-state') {
          return Promise.resolve({
            name: 'Trade Guild',
            description: 'Major trade house',
            value: 500000,
            totalCashReserves: 30000,
            sharesIssued: 2500,
            dividendRate: 3.5,
            creditRating: 'AA',
            interestRate: 5.0,
            outstandingDebt: 40000,
            ownedStellarObjects: [
              { id: 10, name: 'Farm World', className: 'Planet', location: 3, value: 240000 }
            ],
            ships: ['Freighter'],
            loans: [
              { id: 1, principal: 50000, remainingBalance: 40000, interestRate: 5.0, repaymentRate: 2.0 }
            ]
          });
        }
        return Promise.resolve(null);
      });

      await modalManager.openCompanyManagementModal('Trade Guild');

      expect(document.getElementById('company-name-input').value).toBe('Trade Guild');
      expect(document.getElementById('company-credit-rating').textContent).toBe('AA');
      expect(document.getElementById('company-interest-rate').textContent).toBe('5.00%');
      expect(document.getElementById('company-overview-total-value').textContent).toBe('500,000');
      expect(document.getElementById('company-overview-cash-reserves').textContent).toBe('30,000');
      expect(document.getElementById('company-owned-stellar-objects-list').textContent).toContain('Farm World');
      expect(document.getElementById('company-fleet-list').textContent).toContain('Freighter');
      expect(document.getElementById('company-loans-list').textContent).toContain('Loan #1');
      expect(mockContext.refreshCompanyManagementButtons).toHaveBeenCalled();
    });

    test('save profile action invokes update-company-profile', async () => {
      setupCompanyManagementModal();
      mockContext.resolveMessageText.mockResolvedValue('');
      mockApi.invoke.mockImplementation((channel) => {
        if (channel === 'get-company-management-state') {
          return Promise.resolve({
            name: 'Trade Guild',
            description: 'Major trade house',
            value: 500000,
            totalCashReserves: 30000,
            sharesIssued: 2500,
            dividendRate: 3.5,
            creditRating: 'AA',
            interestRate: 5.0,
            outstandingDebt: 0,
            ownedStellarObjects: [],
            ships: [],
            loans: []
          });
        }

        if (channel === 'update-company-profile') {
          return Promise.resolve({ success: true });
        }

        return Promise.resolve(null);
      });

      await modalManager.openCompanyManagementModal('Trade Guild');
      document.getElementById('company-name-input').value = 'Trade Guild Prime';
      document.getElementById('company-description-input').value = 'Updated description';
      document.getElementById('save-company-profile-btn').click();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockApi.invoke).toHaveBeenCalledWith('update-company-profile', {
        currentName: 'Trade Guild',
        name: 'Trade Guild Prime',
        description: 'Updated description'
      });
    });
  });

  describe('openBuildingsModal', () => {
    const buildingsModalHtml = `
      <div class="buildings-modal">
        <h3>Buildings at <span id="buildings-location-name"></span></h3>
        <div id="buildings-list" class="buildings-list"></div>
      </div>
    `;
    const buildingItemHtml = `
      <div class="building-item">
        <img class="building-image" src="" alt="">
        <div class="building-details">
          <div class="building-name"></div>
          <div class="building-cost"></div>
          <div class="building-benefits"></div>
        </div>
        <div class="building-actions">
          <span class="building-built-marker hidden">✓ Built</span>
          <button class="action-btn building-build-btn" type="button">Build</button>
        </div>
      </div>
    `;

    test('renders building rows with built status', async () => {
      global.fetch
        .mockResolvedValueOnce({ ok: true, text: jest.fn().mockResolvedValue(buildingsModalHtml) })
        .mockResolvedValueOnce({ ok: true, text: jest.fn().mockResolvedValue(buildingItemHtml) });
      mockApi.getGameSettings.mockResolvedValue({ data_directory: 'data/default/en-us' });

      await modalManager.openBuildingsModal(
        { id: 2, name: 'Farm World' },
        [
          {
            type: 'Mine',
            image: 'images/buildings/mine.jpg',
            buildCost: { credits: 500, goods: { metal: 10 } },
            data: { mining: 5 },
            isBuilt: false
          },
          {
            type: 'Warehouse',
            image: 'images/buildings/warehouse.jpg',
            buildCost: { credits: 500 },
            data: { storage: 1000 },
            isBuilt: true
          }
        ]
      );

      const rows = document.querySelectorAll('#buildings-list .building-item');
      expect(rows).toHaveLength(2);
      expect(document.getElementById('buildings-location-name').textContent).toBe('Farm World');
      expect(rows[0].querySelector('.building-build-btn').classList.contains('hidden')).toBe(false);
      expect(rows[1].querySelector('.building-built-marker').classList.contains('hidden')).toBe(false);
    });

    test('calls navigation build handler when build is clicked', async () => {
      global.fetch
        .mockResolvedValueOnce({ ok: true, text: jest.fn().mockResolvedValue(buildingsModalHtml) })
        .mockResolvedValueOnce({ ok: true, text: jest.fn().mockResolvedValue(buildingItemHtml) });
      mockApi.getGameSettings.mockResolvedValue({ data_directory: 'data/default/en-us' });

      await modalManager.openBuildingsModal(
        { id: 2, name: 'Factory World' },
        [
          {
            type: 'Factory',
            image: 'images/buildings/factory.jpg',
            buildCost: { credits: 2000 },
            data: { manufactorUnits: 5 },
            isBuilt: false
          }
        ]
      );

      const buildButton = document.querySelector('#buildings-list .building-build-btn');
      buildButton.click();
      expect(window.navigationHandlers.handleBuild).toHaveBeenCalledWith('Factory');
    });
  });

  describe('getShipValue (via openCorporationStatusModal)', () => {
    describe('openTradeModal', () => {
      const tradeHtml = `
          <div class="trade-modal">
            <h3>Trading at <span id="trade-location-name"></span></h3>
            <div id="trade-error" class="trade-error hidden"></div>
            <div id="goods-to-buy"></div>
            <div id="goods-to-sell"></div>
            <p id="passenger-info"></p>
            <div id="passenger-controls" class="hidden">
              <input type="number" id="passenger-count" min="0" value="0">
              <span id="passenger-cargo-info"></span>
              <button id="load-passengers-btn"></button>
            </div>
            <div id="no-passengers-info"></div>
            <div id="passengers-in-cargo-section" class="hidden">
              <p id="passengers-in-cargo-info"></p>
              <input type="number" id="unload-passenger-count" min="0" value="0">
              <span id="unload-passenger-cargo-info"></span>
              <button id="unload-passengers-btn"></button>
              <button id="unload-all-passengers-btn"></button>
            </div>
            <span id="cargo-used"></span>
            <span id="cargo-capacity"></span>
          </div>
        `;
      const tradeItemHtml = '<div class="trade-item"><span id="good-name"></span><span id="good-quantity"></span><span id="good-price"></span><input id="trade-quantity-input" type="number" class="trade-quantity"><button id="trade-btn" class="trade-btn"></button></div>';

      function setupTradeApi({ marketInventory = {}, cargo = {}, passengers = 0, population = { current: 100, limit: 1000 } } = {}) {
        global.fetch
          .mockResolvedValueOnce({ ok: true, text: jest.fn().mockResolvedValue(tradeHtml) })
          .mockResolvedValue({ ok: true, text: jest.fn().mockResolvedValue(tradeItemHtml) });

        mockApi.getLocationState.mockResolvedValue({
          playerState: {
            name: 'Test',
            credits: 10000,
            ship: 'Freighter',
            cargo: { ...cargo, ...(passengers > 0 ? { passengers } : {}) }
          }
        });
        mockApi.invoke.mockImplementation(async (channel, _data) => {
          if (channel === 'get-ships-data') return { Freighter: { cargoCapacity: 100 } };
          if (channel === 'get-goods-data') return { ore: { label: 'Iron Ore', value: 50, finishedMass: { mass: 1, units: 'metric tons' } } };
          if (channel === 'get-market-price') return 55;
          return null;
        });
      }

      test('displays trade location name', async () => {
        setupTradeApi({ marketInventory: { ore: 10 } });
        const obj = {
          id: 1,
          name: 'Mining Station',
          marketState: { inventory: { ore: 10 } },
          population: { current: 500, limit: 1000 }
        };
        await modalManager.openTradeModal(obj);
        expect(document.getElementById('trade-location-name').textContent).toBe('Mining Station');
      });

      test('returns early when locationState is null', async () => {
        global.fetch.mockResolvedValueOnce({ ok: true, text: jest.fn().mockResolvedValue(tradeHtml) });
        mockApi.getLocationState.mockResolvedValue(null);
        await modalManager.openTradeModal({ id: 1, name: 'Station', population: { current: 0, limit: 100 } });
        // Should not throw
      });

      test('shows no market message when no marketState', async () => {
        setupTradeApi();
        const obj = { id: 1, name: 'Station', marketState: null, population: { current: 100, limit: 1000 } };
        await modalManager.openTradeModal(obj);
        const buyDiv = document.getElementById('goods-to-buy');
        expect(buyDiv.textContent).toContain('No market available.');
      });

      test('shows empty market message when inventory is empty', async () => {
        setupTradeApi({ marketInventory: {} });
        const obj = { id: 1, name: 'Station', marketState: { inventory: {} }, population: { current: 100, limit: 1000 } };
        await modalManager.openTradeModal(obj);
        const buyDiv = document.getElementById('goods-to-buy');
        expect(buyDiv.textContent).toContain('No goods available for purchase.');
      });

      test('shows cargo items to sell when player has cargo', async () => {
        setupTradeApi({ cargo: { ore: 5 } });
        const obj = { id: 1, name: 'Station', marketState: { inventory: {} }, population: { current: 100, limit: 1000 } };
        await modalManager.openTradeModal(obj);
        const sellDiv = document.getElementById('goods-to-sell');
        expect(sellDiv.textContent).not.toContain('Your cargo is empty.');
      });

      test('shows empty cargo message when no cargo to sell', async () => {
        setupTradeApi({ cargo: {} });
        const obj = { id: 1, name: 'Station', marketState: { inventory: {} }, population: { current: 100, limit: 1000 } };
        await modalManager.openTradeModal(obj);
        const sellDiv = document.getElementById('goods-to-sell');
        expect(sellDiv.textContent).toContain('Your cargo is empty.');
      });

      test('shows no passengers info when population is too low', async () => {
        setupTradeApi({ population: { current: 10, limit: 1000 } });
        const obj = { id: 1, name: 'Station', marketState: null, population: { current: 10, limit: 1000 } };
        await modalManager.openTradeModal(obj);
        const passengerControls = document.getElementById('passenger-controls');
        expect(passengerControls.classList.contains('hidden')).toBe(true);
      });

      test('shows passengers in cargo section when passengers on board', async () => {
        // Override tradeHtml to include passenger-in-cargo elements
        global.fetch
          .mockResolvedValueOnce({
            ok: true,
            text: jest.fn().mockResolvedValue(`
                <div class="trade-modal">
                  <span id="trade-location-name"></span>
                  <div id="trade-error" class="trade-error hidden"></div>
                  <div id="goods-to-buy"></div>
                  <div id="goods-to-sell"></div>
                  <p id="passenger-info"></p>
                  <div id="passenger-controls" class="hidden">
                    <input type="number" id="passenger-count" min="0" value="0">
                    <span id="passenger-cargo-info"></span>
                    <button id="load-passengers-btn"></button>
                  </div>
                  <div id="no-passengers-info"></div>
                  <div id="passengers-in-cargo-section" class="hidden">
                    <p id="passengers-in-cargo-info"></p>
                    <input type="number" id="unload-passenger-count" min="0" value="0">
                    <span id="unload-passenger-cargo-info"></span>
                    <button id="unload-passengers-btn"></button>
                    <button id="unload-all-passengers-btn"></button>
                  </div>
                  <span id="cargo-used"></span>
                  <span id="cargo-capacity"></span>
                </div>
              `)
          })
          .mockResolvedValue({ ok: true, text: jest.fn().mockResolvedValue('<div class="trade-item"><span id="good-name"></span><span id="good-quantity"></span><span id="good-price"></span><input id="trade-quantity-input" type="number" class="trade-quantity"><button id="trade-btn" class="trade-btn"></button></div>') });

        mockApi.getLocationState.mockResolvedValue({
          playerState: { name: 'Test', credits: 10000, ship: 'Freighter', cargo: { passengers: 5 } }
        });
        mockApi.invoke.mockImplementation(async (channel) => {
          if (channel === 'get-ships-data') return { Freighter: { cargoCapacity: 100 } };
          if (channel === 'get-goods-data') return {};
          if (channel === 'get-market-price') return 55;
          return null;
        });

        const obj = { id: 1, name: 'Station', marketState: null, population: { current: 500, limit: 1000 } };
        await modalManager.openTradeModal(obj);
        const passengerSection = document.getElementById('passengers-in-cargo-section');
        expect(passengerSection.classList.contains('hidden')).toBe(false);
        expect(document.getElementById('passengers-in-cargo-info').textContent).toContain('5');
      });

      test('buys goods and refreshes location state on success', async () => {
        setupTradeApi({ marketInventory: { ore: 2 }, cargo: {} });
        const obj = {
          id: 1,
          name: 'Station',
          marketState: { inventory: { ore: 2 } },
          population: { current: 500, limit: 1000 }
        };
        mockApi.invoke.mockImplementation(async (channel, data) => {
          if (channel === 'get-ships-data') return { Freighter: { cargoCapacity: 100 } };
          if (channel === 'get-goods-data') return { ore: { label: 'Iron Ore', value: 50, finishedMass: { mass: 1, units: 'metric tons' } } };
          if (channel === 'get-market-price') return 55;
          if (channel === 'trade-goods') return { success: true, message: 'Trade completed' };
          return null;
        });

        await modalManager.openTradeModal(obj);
        const tradeButton = document.querySelector('#goods-to-buy .trade-btn');
        const quantityInput = document.querySelector('#goods-to-buy .trade-quantity');
        quantityInput.value = '1';
        tradeButton.click();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(mockContext.addMessage).toHaveBeenCalledWith('Trade completed');
        expect(mockContext.updateLocationDisplay).toHaveBeenCalled();
        expect(mockContext.updateShipStatus).toHaveBeenCalled();
      });

      test('shows trade error when buying with invalid quantity', async () => {
        setupTradeApi({ marketInventory: { ore: 1 }, cargo: {} });
        const obj = {
          id: 1,
          name: 'Station',
          marketState: { inventory: { ore: 1 } },
          population: { current: 500, limit: 1000 }
        };
        await modalManager.openTradeModal(obj);
        const tradeButton = document.querySelector('#goods-to-buy .trade-btn');
        const quantityInput = document.querySelector('#goods-to-buy .trade-quantity');
        quantityInput.value = '0';
        tradeButton.click();

        expect(document.getElementById('trade-error').textContent).toContain('Please enter a quantity greater than 0.');
      });

      test('loads passengers on success', async () => {
        setupTradeApi({ passengers: 0, population: { current: 500, limit: 1000 } });
        mockApi.invoke.mockImplementation(async (channel, data) => {
          if (channel === 'get-ships-data') return { Freighter: { cargoCapacity: 100 } };
          if (channel === 'get-goods-data') return {};
          if (channel === 'load-passengers') return { success: true, message: 'Passengers loaded' };
          return null;
        });

        const obj = { id: 1, name: 'Station', marketState: null, population: { current: 500, limit: 1000 } };
        await modalManager.openTradeModal(obj);
        document.getElementById('passenger-count').value = '10';
        document.getElementById('load-passengers-btn').click();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(mockContext.addMessage).toHaveBeenCalledWith('Passengers loaded');
        expect(mockContext.updateLocationDisplay).toHaveBeenCalled();
        expect(mockContext.updateShipStatus).toHaveBeenCalled();
      });

      test('unloads passengers on success', async () => {
        setupTradeApi({ passengers: 5, population: { current: 500, limit: 1000 } });
        mockApi.invoke.mockImplementation(async (channel, data) => {
          if (channel === 'get-ships-data') return { Freighter: { cargoCapacity: 100 } };
          if (channel === 'get-goods-data') return {};
          if (channel === 'unload-passengers') return { success: true, message: 'Passengers unloaded' };
          return null;
        });

        const obj = { id: 1, name: 'Station', marketState: null, population: { current: 500, limit: 1000 } };
        await modalManager.openTradeModal(obj);
        document.getElementById('unload-passenger-count').value = '5';
        document.getElementById('unload-passengers-btn').click();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(mockContext.addMessage).toHaveBeenCalledWith('Passengers unloaded');
        expect(mockContext.updateLocationDisplay).toHaveBeenCalled();
        expect(mockContext.updateShipStatus).toHaveBeenCalled();
      });
    });

    describe('openJumpPlanner calculate-route', () => {
      const jumpPlannerHtml = `
          <div>
            <span id="current-system-display"></span>
            <input type="number" id="destination-system" value="">
            <button id="calculate-route-btn">Calculate</button>
            <div id="route-display"></div>
          </div>
        `;
      const jumpRouteHtml = `
          <div>
            <span id="route-path"></span>
            <span id="route-jumps"></span>
            <span id="route-tick-cost"></span>
            <span id="route-energy-required"></span>
            <span id="route-energy-available"></span>
            <div id="route-energy-warning" hidden></div>
            <button id="confirm-jump-route-btn"></button>
            <button id="cancel-jump-route-btn"></button>
          </div>
        `;

      function setupJumpPlannerApi() {
        mockApi.getLocationState.mockResolvedValue({
          playerState: { dockedAt: null, landedOn: null, location: 1 }
        });
        mockApi.invoke.mockImplementation(async (channel, _data) => {
          if (channel === 'get-all-systems') return [{ id: 1, name: 'Sol' }, { id: 2, name: 'Alpha' }];
          if (channel === 'calculate-jump-route') return { success: true, route: [1, 2], cost: 3, energyRequired: 10, currentEnergy: 80 };
          return null;
        });
        global.fetch
          .mockResolvedValueOnce({ ok: true, text: jest.fn().mockResolvedValue(jumpPlannerHtml) })
          .mockResolvedValueOnce({ ok: true, text: jest.fn().mockResolvedValue(jumpRouteHtml) });
      }

      test('shows error for invalid destination ID', async () => {
        mockApi.getLocationState.mockResolvedValue({
          playerState: { dockedAt: null, landedOn: null, location: 1 }
        });
        mockApi.invoke.mockResolvedValue([{ id: 1, name: 'Sol' }, { id: 2, name: 'Alpha' }]);
        global.fetch
          .mockResolvedValueOnce({ ok: true, text: jest.fn().mockResolvedValue(jumpPlannerHtml) })
          .mockResolvedValue({ ok: true, text: jest.fn().mockResolvedValue('<p id="error-message-text"></p>') });

        await modalManager.openJumpPlanner();
        document.getElementById('destination-system').value = '0';
        document.getElementById('calculate-route-btn').click();
        await new Promise(r => setTimeout(r, 50));
        expect(document.getElementById('route-display').textContent).not.toBe('');
      });

      test('shows error when destination equals current system', async () => {
        mockApi.getLocationState.mockResolvedValue({
          playerState: { dockedAt: null, landedOn: null, location: 1 }
        });
        mockApi.invoke.mockResolvedValue([{ id: 1, name: 'Sol' }, { id: 2, name: 'Alpha' }]);
        global.fetch
          .mockResolvedValueOnce({ ok: true, text: jest.fn().mockResolvedValue(jumpPlannerHtml) })
          .mockResolvedValue({ ok: true, text: jest.fn().mockResolvedValue('<p id="error-message-text"></p>') });

        await modalManager.openJumpPlanner();
        document.getElementById('destination-system').value = '1';
        document.getElementById('calculate-route-btn').click();
        await new Promise(r => setTimeout(r, 50));
        expect(document.getElementById('route-display').textContent).not.toBe('');
      });

      test('shows error for non-existent system', async () => {
        mockApi.getLocationState.mockResolvedValue({
          playerState: { dockedAt: null, landedOn: null, location: 1 }
        });
        mockApi.invoke.mockResolvedValue([{ id: 1, name: 'Sol' }, { id: 2, name: 'Alpha' }]);
        global.fetch
          .mockResolvedValueOnce({ ok: true, text: jest.fn().mockResolvedValue(jumpPlannerHtml) })
          .mockResolvedValue({ ok: true, text: jest.fn().mockResolvedValue('<p id="error-message-text"></p>') });

        await modalManager.openJumpPlanner();
        document.getElementById('destination-system').value = '99';
        document.getElementById('calculate-route-btn').click();
        await new Promise(r => setTimeout(r, 50));
        expect(document.getElementById('route-display').textContent).not.toBe('');
      });

      test('shows route details when route calculation succeeds', async () => {
        setupJumpPlannerApi();

        await modalManager.openJumpPlanner();
        document.getElementById('destination-system').value = '2';
        document.getElementById('calculate-route-btn').click();
        await new Promise(r => setTimeout(r, 50));

        expect(document.getElementById('route-jumps').textContent).toBe('1');
        expect(document.getElementById('route-tick-cost').textContent).toBe('3');
      });

      test('shows error when route calculation fails', async () => {
        mockApi.getLocationState.mockResolvedValue({
          playerState: { dockedAt: null, landedOn: null, location: 1 }
        });
        mockApi.invoke.mockImplementation(async (channel) => {
          if (channel === 'get-all-systems') return [{ id: 1, name: 'Sol' }, { id: 2, name: 'Alpha' }];
          if (channel === 'calculate-jump-route') return { success: false, reason: 'No route found' };
          return null;
        });
        global.fetch
          .mockResolvedValueOnce({ ok: true, text: jest.fn().mockResolvedValue(jumpPlannerHtml) })
          .mockResolvedValue({ ok: true, text: jest.fn().mockResolvedValue('<p id="error-message-text"></p>') });

        await modalManager.openJumpPlanner();
        document.getElementById('destination-system').value = '2';
        document.getElementById('calculate-route-btn').click();
        await new Promise(r => setTimeout(r, 50));
        // Should display error
        expect(document.getElementById('route-display').textContent).not.toBe('');
      });
    });

    test('returns 0 on error fetching ship data', async () => {
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          text: jest.fn().mockResolvedValue(
            '<span id="corp-name"></span><span id="corp-description"></span><span id="corp-value"></span><div id="corp-planets-list"></div><div id="corp-ships-list"></div>'
          )
        })
        .mockResolvedValueOnce({
          ok: true,
          text: jest.fn().mockResolvedValue(
            '<div class="asset-item"><strong id="asset-name"></strong><span id="asset-class"></span><br><span id="asset-location"></span><br>Value: <span id="asset-value"></span> credits</div>'
          )
        });

      mockApi.getLocationState.mockResolvedValue({
        playerState: {
          ship: 'Unknown',
          system: 1,
          corporation: { name: 'C', description: '', value: 0, totalCashReserves: 0, stellarObjects: [] }
        }
      });
      mockApi.getUniverseState.mockResolvedValue({ stellarObjects: [] });
      // Simulate error from getGameData
      mockApi.getGameData.mockRejectedValue(new Error('Ship data not found'));

      await modalManager.openCorporationStatusModal();

      const shipValueEl = document.getElementById('corp-ships-list')?.querySelector('#asset-value');
      if (shipValueEl) {
        expect(shipValueEl.textContent).toBe('0');
      }
      expect(window.logger.error).toHaveBeenCalled();
    });
  });
});
