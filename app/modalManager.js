(function () {
  // Context references set during init()
  let _api;
  let _addMessage;
  let _resolveMessageText;
  let _updateLocationDisplay;
  let _updateShipStatus;
  let _displayStellarObjectProperties;
  let _executeJumpSequence;
  let _refreshCompanyManagementButtons;

  // Modal DOM references cached after init()
  let _gameModal;
  let _modalTitle;
  let _modalBody;

  /**
   * Initialize the modal manager with shared game context.
   * Registers close-modal event listeners.
   * @param {Object} context - Shared game context.
   * @param {Object} context.api - window.api IPC bridge.
   * @param {Function} context.addMessage - Display a message in the console.
   * @param {Function} context.resolveMessageText - Resolve a localized message string.
   * @param {Function} context.updateLocationDisplay - Refresh the location display.
   * @param {Function} context.updateShipStatus - Refresh the ship status panel.
   * @param {Function} context.displayStellarObjectProperties - Display object details.
   * @param {Function} context.executeJumpSequence - Execute a multi-hop jump sequence.
   * @param {Function} context.refreshCompanyManagementButtons - Refresh company management buttons.
   */
  function init(context) {
    _api = context.api;
    _addMessage = context.addMessage;
    _resolveMessageText = context.resolveMessageText;
    _updateLocationDisplay = context.updateLocationDisplay;
    _updateShipStatus = context.updateShipStatus;
    _displayStellarObjectProperties = context.displayStellarObjectProperties;
    _executeJumpSequence = context.executeJumpSequence;
    _refreshCompanyManagementButtons = context.refreshCompanyManagementButtons;

    _gameModal = document.getElementById('game-modal');
    _modalTitle = document.getElementById('modal-title');
    _modalBody = document.getElementById('modal-body');

    const modalCloseBtn = document.getElementById('modal-close-btn');
    if (modalCloseBtn) {
      modalCloseBtn.addEventListener('click', closeModal);
    }

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && _gameModal && _gameModal.classList.contains('visible')) {
        closeModal();
      }
    });

    if (_gameModal) {
      _gameModal.addEventListener('click', (event) => {
        if (event.target === _gameModal) {
          closeModal();
        }
      });
    }
  }

  /**
   * Load and display a modal with the specified title and content file.
   * @param {string} title - Title to display in the modal header.
   * @param {string} contentFile - Path to the HTML content file (relative to app/).
   * @param {Function} onLoad - Optional callback called after content is loaded.
   */
  async function loadModal(title, contentFile, onLoad) {
    try {
      const html = await window.gameHelpers.loadTemplate(contentFile);

      _modalTitle.textContent = title;
      _modalBody.innerHTML = html;

      if (onLoad && typeof onLoad === 'function') {
        await onLoad();
      }

      _gameModal.classList.add('visible');
    } catch (error) {
      window.logger.error('Error loading modal:', error);
    }
  }

  /**
   * Close the currently displayed modal.
   */
  function closeModal() {
    _gameModal.classList.remove('visible');
    _modalBody.innerHTML = '';
    const modalContent = document.querySelector('.modal-content');
    if (modalContent) {
      modalContent.classList.remove('wide');
    }
  }

  /**
   * Load and display an error message using the error template.
   * @param {HTMLElement} container - Container element for the error message.
   * @param {string} message - Error message text.
   */
  async function displayErrorMessage(container, message) {
    try {
      const template = await window.gameHelpers.loadTemplate('./templates/error-message.html');
      container.innerHTML = template;
      const textEl = document.getElementById('error-message-text');
      if (textEl) {
        textEl.textContent = message;
      }
    } catch (error) {
      window.logger.error('Error loading error message template:', error);
      const p = document.createElement('p');
      p.className = 'error-message';
      p.textContent = message;
      container.appendChild(p);
    }
  }

  /**
   * Open the player status modal and populate it with current player data.
   */
  async function openPlayerStatusModal() {
    await loadModal('Player Status', './modals/player-status.html', async () => {
      const locationState = await _api.getLocationState();
      if (!locationState) return;

      const playerState = locationState.playerState;
      const goodsData = await _api.invoke('get-goods-data');

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

      const corpStatusBtn = document.getElementById('btn-corporation-status');
      if (corpStatusBtn) {
        corpStatusBtn.addEventListener('click', openCorporationStatusModal);
      }
    });
  }

  /**
   * Get the depreciated value of a ship by its type (10% depreciation applied).
   * @param {string} shipType - The type/name of the ship.
   * @returns {Promise<number>} Depreciated ship value.
   */
  async function getShipValue(shipType) {
    try {
      const ships = await _api.getGameData('ships');
      const baseValue = ships[shipType]?.value || 0;
      return Math.floor(baseValue * 0.9);
    } catch (error) {
      window.logger.error('Error getting ship value:', error);
      return 0;
    }
  }

  /**
   * Open the corporation status modal and populate it with corporation assets.
   */
  async function openCorporationStatusModal() {
    await loadModal('Corporation Status', './modals/corporation-status.html', async () => {
      const locationState = await _api.getLocationState();
      if (!locationState) return;

      const playerState = locationState.playerState;
      const corporation = playerState.corporation;

      document.getElementById('corp-name').textContent = corporation.name;
      document.getElementById('corp-description').textContent = corporation.description;
      document.getElementById('corp-value').textContent = corporation.value.toLocaleString();
      const cashTotalElement = document.getElementById('corp-cash-total');
      if (cashTotalElement) {
        cashTotalElement.textContent = corporation.totalCashReserves.toLocaleString();
      }

      const universeState = await _api.getUniverseState();
      const assetItemTemplate = await window.gameHelpers.loadTemplate('./templates/asset-item.html');

      const planetsList = document.getElementById('corp-planets-list');
      if (corporation.stellarObjects && corporation.stellarObjects.length > 0) {
        planetsList.innerHTML = '';
        const items = corporation.stellarObjects
          .map(objId => universeState.stellarObjects.find(obj => obj.id === objId))
          .filter(Boolean);

        if (items.length > 0) {
          items.forEach(stellarObj => {
            const div = document.createElement('div');
            div.innerHTML = assetItemTemplate;
            const item = div.firstElementChild;
            item.querySelector('#asset-name').textContent = stellarObj.name;
            item.querySelector('#asset-class').textContent = `(${stellarObj.className})`;
            item.querySelector('#asset-location').textContent = `System: ${stellarObj.location}`;
            item.querySelector('#asset-value').textContent = stellarObj.value.toLocaleString();
            planetsList.appendChild(item);
          });
        } else {
          const p = document.createElement('p');
          p.textContent = 'No planets owned';
          planetsList.appendChild(p);
        }
      } else {
        const p = document.createElement('p');
        p.textContent = 'No planets owned';
        planetsList.appendChild(p);
      }

      const shipsList = document.getElementById('corp-ships-list');
      shipsList.innerHTML = '';
      const shipDiv = document.createElement('div');
      shipDiv.innerHTML = assetItemTemplate;
      const shipItem = shipDiv.firstElementChild;
      shipItem.querySelector('#asset-name').textContent = playerState.ship;
      shipItem.querySelector('#asset-class').textContent = '';
      shipItem.querySelector('#asset-location').textContent = `Location: System ${playerState.system}`;
      shipItem.querySelector('#asset-value').textContent = (await getShipValue(playerState.ship)).toLocaleString();
      shipsList.appendChild(shipItem);

      const backBtn = document.getElementById('btn-player-status');
      if (backBtn) {
        backBtn.addEventListener('click', openPlayerStatusModal);
      }
    });
  }

  /**
   * Open company management modal for a selected player-controlled company.
   * @param {string} companyName - Company name to manage.
   */
  async function openCompanyManagementModal(companyName) {
    const companyManagementTitle = await _resolveMessageText('company_management.modal_title');

    await loadModal(companyManagementTitle, './modals/company-management.html', async () => {
      let selectedCompanyName = companyName;

      /**
       * Set text content for a modal element from a message key.
       * @param {string} elementId - Element id to update.
       * @param {string} messageKey - Message key path.
       * @returns {Promise<void>}
       */
      async function setElementTextFromMessage(elementId, messageKey) {
        const element = document.getElementById(elementId);
        if (!element) {
          return;
        }

        const text = await _resolveMessageText(messageKey);
        element.textContent = text || '';
      }

      /**
       * Populate static labels and button text for the modal.
       * @returns {Promise<void>}
       */
      async function setCompanyManagementLabels() {
        const labelMappings = [
          ['company-tab-profile', 'company_management.tabs.profile'],
          ['company-tab-finance', 'company_management.tabs.finance'],
          ['company-tab-loans', 'company_management.tabs.loans'],
          ['company-tab-trade-routes', 'company_management.tabs.trade_routes'],
          ['company-profile-heading', 'company_management.profile.heading'],
          ['company-name-label', 'company_management.profile.name'],
          ['company-description-label', 'company_management.profile.description'],
          ['save-company-profile-btn', 'company_management.profile.save'],
          ['company-finance-heading', 'company_management.finance.heading'],
          ['company-value-label', 'company_management.finance.total_value'],
          ['company-cash-reserves-label', 'company_management.finance.cash_reserves'],
          ['company-shares-issued-label', 'company_management.finance.shares_issued'],
          ['company-dividend-rate-label', 'company_management.finance.dividend_rate'],
          ['set-company-dividend-btn', 'company_management.finance.set_dividend'],
          ['company-issue-shares-label', 'company_management.finance.issue_shares'],
          ['issue-company-shares-btn', 'company_management.finance.issue_shares_action'],
          ['company-loans-heading', 'company_management.loans.heading'],
          ['company-credit-rating-label', 'company_management.loans.credit_rating'],
          ['company-interest-rate-label', 'company_management.loans.interest_rate'],
          ['company-outstanding-debt-label', 'company_management.loans.outstanding_debt'],
          ['company-loan-amount-label', 'company_management.loans.take_loan_amount'],
          ['take-company-loan-btn', 'company_management.loans.take_loan_action'],
          ['company-outstanding-loans-heading', 'company_management.loans.outstanding_loans'],
          ['company-loan-payment-select-label', 'company_management.loans.loan_label'],
          ['company-loan-payment-amount-label', 'company_management.loans.payment_amount'],
          ['make-company-loan-payment-btn', 'company_management.loans.make_payment'],
          ['company-loan-repayment-select-label', 'company_management.loans.loan_label'],
          ['company-loan-repayment-rate-label', 'company_management.loans.repayment_rate'],
          ['set-company-loan-repayment-btn', 'company_management.loans.set_repayment_rate'],
          ['company-trade-routes-heading', 'company_management.trade_routes.heading'],
          ['company-trade-routes-placeholder', 'company_management.trade_routes.placeholder']
        ];

        await Promise.all(labelMappings.map(([elementId, messageKey]) => setElementTextFromMessage(elementId, messageKey)));
      }

      /**
       * Switch the active company tab.
       * @param {string} tabName - Tab name key.
       */
      function setActiveTab(tabName) {
        const tabNames = ['profile', 'finance', 'loans', 'trade-routes'];

        tabNames.forEach((name) => {
          const tabButton = document.getElementById(`company-tab-${name}`);
          const tabContent = document.getElementById(`company-tab-content-${name}`);

          if (tabButton) {
            tabButton.disabled = name === tabName;
          }

          if (tabContent) {
            if (name === tabName) {
              tabContent.classList.remove('hidden');
            } else {
              tabContent.classList.add('hidden');
            }
          }
        });
      }

      /**
       * Replace options in a loan selector with current loan data.
       * @param {HTMLSelectElement} selectEl - Select element to populate.
       * @param {Object[]} loans - Loan entries.
       * @returns {Promise<void>}
       */
      async function populateLoanSelect(selectEl, loans) {
        if (!selectEl) {
          return;
        }

        while (selectEl.firstChild) {
          selectEl.removeChild(selectEl.firstChild);
        }
        for (const loan of loans) {
          const option = document.createElement('option');
          option.value = String(loan.id);
          option.textContent = await _resolveMessageText(
            'company_management.loans.loan_option',
            {
              loanId: loan.id,
              balance: loan.remainingBalance.toLocaleString()
            }
          );
          selectEl.appendChild(option);
        }
      }

      /**
       * Render outstanding loan items in the modal.
       * @param {Object[]} loans - Loan entries.
       * @returns {Promise<void>}
       */
      async function renderLoanList(loans) {
        const loansList = document.getElementById('company-loans-list');
        if (!loansList) {
          return;
        }

        loansList.innerHTML = '';

        if (!Array.isArray(loans) || loans.length === 0) {
          const noLoansMessage = document.createElement('p');
          noLoansMessage.textContent = await _resolveMessageText('company_management.loans.none_outstanding');
          loansList.appendChild(noLoansMessage);
          return;
        }

        for (const loan of loans) {
          const loanLine = document.createElement('p');
          loanLine.textContent = await _resolveMessageText('company_management.loans.loan_line', {
            loanId: loan.id,
            principal: loan.principal.toLocaleString(),
            remaining: loan.remainingBalance.toLocaleString(),
            interestRate: loan.interestRate.toFixed(2),
            repaymentRate: loan.repaymentRate.toFixed(2)
          });
          loansList.appendChild(loanLine);
        }
      }

      /**
       * Populate modal fields from company management state.
       * @returns {Promise<void>}
       */
      async function refreshCompanyState() {
        const companyState = await _api.invoke('get-company-management-state', {
          companyName: selectedCompanyName
        });

        if (!companyState) {
          return;
        }

        const previousCompanyName = selectedCompanyName;
        selectedCompanyName = companyState.name || previousCompanyName;

        const companyNameInput = document.getElementById('company-name-input');
        if (companyNameInput) {
          companyNameInput.value = companyState.name;
        }

        const companyDescriptionInput = document.getElementById('company-description-input');
        if (companyDescriptionInput) {
          companyDescriptionInput.value = companyState.description || '';
        }

        const companyValue = document.getElementById('company-value');
        if (companyValue) {
          companyValue.textContent = companyState.value.toLocaleString();
        }

        const companyCashReserves = document.getElementById('company-cash-reserves');
        if (companyCashReserves) {
          companyCashReserves.textContent = companyState.totalCashReserves.toLocaleString();
        }

        const companySharesIssued = document.getElementById('company-shares-issued');
        if (companySharesIssued) {
          companySharesIssued.textContent = companyState.sharesIssued.toLocaleString();
        }

        const companyDividendRateInput = document.getElementById('company-dividend-rate-input');
        if (companyDividendRateInput) {
          companyDividendRateInput.value = String(companyState.dividendRate);
        }

        const companyCreditRating = document.getElementById('company-credit-rating');
        if (companyCreditRating) {
          companyCreditRating.textContent = companyState.creditRating;
        }

        const companyInterestRate = document.getElementById('company-interest-rate');
        if (companyInterestRate) {
          companyInterestRate.textContent = `${companyState.interestRate.toFixed(2)}%`;
        }

        const companyOutstandingDebt = document.getElementById('company-outstanding-debt');
        if (companyOutstandingDebt) {
          companyOutstandingDebt.textContent = companyState.outstandingDebt.toLocaleString();
        }

        await renderLoanList(companyState.loans || []);
        await populateLoanSelect(document.getElementById('company-loan-payment-select'), companyState.loans || []);
        await populateLoanSelect(document.getElementById('company-loan-repayment-select'), companyState.loans || []);

        if (typeof _refreshCompanyManagementButtons === 'function') {
          await _refreshCompanyManagementButtons();
        }
      }

      document.querySelectorAll('.company-management-tabs [data-tab]').forEach((button) => {
        button.addEventListener('click', () => {
          setActiveTab(button.getAttribute('data-tab'));
        });
      });

      const saveCompanyProfileBtn = document.getElementById('save-company-profile-btn');
      if (saveCompanyProfileBtn) {
        saveCompanyProfileBtn.addEventListener('click', async () => {
          const companyNameInput = document.getElementById('company-name-input');
          const companyDescriptionInput = document.getElementById('company-description-input');

          await _api.invoke('update-company-profile', {
            currentName: selectedCompanyName,
            name: companyNameInput ? companyNameInput.value : '',
            description: companyDescriptionInput ? companyDescriptionInput.value : ''
          });

          await refreshCompanyState();
        });
      }

      const setCompanyDividendBtn = document.getElementById('set-company-dividend-btn');
      if (setCompanyDividendBtn) {
        setCompanyDividendBtn.addEventListener('click', async () => {
          const companyDividendRateInput = document.getElementById('company-dividend-rate-input');
          await _api.invoke('update-company-dividend-rate', {
            companyName: selectedCompanyName,
            dividendRate: companyDividendRateInput ? companyDividendRateInput.value : ''
          });
          await refreshCompanyState();
        });
      }

      const issueCompanySharesBtn = document.getElementById('issue-company-shares-btn');
      if (issueCompanySharesBtn) {
        issueCompanySharesBtn.addEventListener('click', async () => {
          const companyIssueSharesInput = document.getElementById('company-issue-shares-input');
          await _api.invoke('issue-company-shares', {
            companyName: selectedCompanyName,
            shares: companyIssueSharesInput ? companyIssueSharesInput.value : ''
          });
          await refreshCompanyState();
        });
      }

      const takeCompanyLoanBtn = document.getElementById('take-company-loan-btn');
      if (takeCompanyLoanBtn) {
        takeCompanyLoanBtn.addEventListener('click', async () => {
          const companyLoanAmountInput = document.getElementById('company-loan-amount-input');
          await _api.invoke('take-company-loan', {
            companyName: selectedCompanyName,
            amount: companyLoanAmountInput ? companyLoanAmountInput.value : ''
          });
          await refreshCompanyState();
        });
      }

      const makeCompanyLoanPaymentBtn = document.getElementById('make-company-loan-payment-btn');
      if (makeCompanyLoanPaymentBtn) {
        makeCompanyLoanPaymentBtn.addEventListener('click', async () => {
          const loanSelect = document.getElementById('company-loan-payment-select');
          const paymentInput = document.getElementById('company-loan-payment-amount-input');
          await _api.invoke('make-company-loan-payment', {
            companyName: selectedCompanyName,
            loanId: loanSelect ? loanSelect.value : '',
            amount: paymentInput ? paymentInput.value : ''
          });
          await refreshCompanyState();
        });
      }

      const setCompanyLoanRepaymentBtn = document.getElementById('set-company-loan-repayment-btn');
      if (setCompanyLoanRepaymentBtn) {
        setCompanyLoanRepaymentBtn.addEventListener('click', async () => {
          const loanSelect = document.getElementById('company-loan-repayment-select');
          const repaymentRateInput = document.getElementById('company-loan-repayment-rate-input');
          await _api.invoke('set-company-loan-repayment-rate', {
            companyName: selectedCompanyName,
            loanId: loanSelect ? loanSelect.value : '',
            repaymentRate: repaymentRateInput ? repaymentRateInput.value : ''
          });
          await refreshCompanyState();
        });
      }

      setActiveTab('profile');
      await setCompanyManagementLabels();
      await refreshCompanyState();
    });
  }

  /**
   * Open the trade modal for buying/selling goods and loading passengers.
   * @param {Object} stellarObject - The stellar object to trade with.
   */
  async function openTradeModal(stellarObject) {
    await loadModal('Trade', './modals/trade.html', async () => {
      const modalContent = document.querySelector('.modal-content');
      if (modalContent) {
        modalContent.classList.add('wide');
      }

      /**
       * Display an error message in the trade modal.
       * @param {string} message - Error message to display.
       */
      function showTradeError(message) {
        const errorDiv = document.getElementById('trade-error');
        if (errorDiv) {
          errorDiv.textContent = message;
          errorDiv.classList.remove('hidden');
        }
      }

      /**
       * Hide the error message in the trade modal.
       */
      function hideTradeError() {
        const errorDiv = document.getElementById('trade-error');
        if (errorDiv) {
          errorDiv.classList.add('hidden');
        }
      }

      const locationState = await _api.getLocationState();
      if (!locationState) return;

      const playerState = locationState.playerState;
      const shipsData = await _api.invoke('get-ships-data');
      const shipData = shipsData[playerState.ship];
      const goodsData = await _api.invoke('get-goods-data');

      document.getElementById('trade-location-name').textContent = stellarObject.name;

      let cargoUsed = 0;
      const cargo = playerState.cargo || {};
      cargoUsed = window.gameHelpers.calculateCargoMass(cargo, goodsData);

      const cargoCapacity = shipData.cargoCapacity;

      document.getElementById('cargo-used').textContent = cargoUsed.toFixed(2);
      document.getElementById('cargo-capacity').textContent = cargoCapacity;

      const goodsToBuyDiv = document.getElementById('goods-to-buy');
      goodsToBuyDiv.innerHTML = '';

      if (stellarObject.marketState && stellarObject.marketState.inventory) {
        const inventory = stellarObject.marketState.inventory;
        if (Object.keys(inventory).length === 0) {
          const noGoods = document.createElement('p');
          noGoods.textContent = 'No goods available for purchase.';
          goodsToBuyDiv.appendChild(noGoods);
        } else {
          const tradeItemTemplate = await window.gameHelpers.loadTemplate('./templates/trade-item.html');
          for (const [goodName, quantity] of Object.entries(inventory)) {
            if (quantity > 0) {
              const good = goodsData[goodName];
              const price = await _api.invoke('get-market-price', {
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

      const goodsToSellDiv = document.getElementById('goods-to-sell');
      goodsToSellDiv.innerHTML = '';

      if (Object.keys(cargo).filter(k => k !== 'passengers').length === 0) {
        const emptyCargo = document.createElement('p');
        emptyCargo.textContent = 'Your cargo is empty.';
        goodsToSellDiv.appendChild(emptyCargo);
      } else {
        const tradeItemTemplate = await window.gameHelpers.loadTemplate('./templates/trade-item.html');
        for (const [goodName, quantity] of Object.entries(cargo)) {
          if (goodName === 'passengers') continue;
          if (quantity > 0) {
            const good = goodsData[goodName];
            const price = await _api.invoke('get-market-price', {
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

      document.querySelectorAll('.trade-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          hideTradeError();

          const goodName = btn.dataset.good;
          const price = parseFloat(btn.dataset.price);
          const action = btn.dataset.action;
          const input = btn.parentElement.querySelector('.trade-quantity');
          const quantity = parseInt(input.value);

          if (quantity <= 0) {
            showTradeError('Please enter a quantity greater than 0.');
            return;
          }

          const result = await _api.invoke('trade-goods', {
            action,
            goodName,
            quantity,
            price,
            stellarObjectId: stellarObject.id
          });

          if (result.success) {
            _addMessage(result.message);
            closeModal();
            await _updateLocationDisplay();
            await _updateShipStatus();
          } else {
            showTradeError(result.message);
          }
        });
      });

      const population = stellarObject.population;
      const passengerInfo = document.getElementById('passenger-info');
      const passengerControls = document.getElementById('passenger-controls');
      const noPassengersInfo = document.getElementById('no-passengers-info');

      const populationPercent = (population.current / population.limit) * 100;
      let availablePassengers = 0;

      if (populationPercent < 25) {
        availablePassengers = 0;
      } else {
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

        const availableCargoSpace = cargoCapacity - cargoUsed;
        const maxPassengersFromCargo = Math.floor(availableCargoSpace * 10);
        const maxPassengers = Math.min(availablePassengers, maxPassengersFromCargo);

        passengerInput.max = maxPassengers;
        passengerInput.value = 0;

        passengerInput.addEventListener('input', () => {
          const count = parseInt(passengerInput.value) || 0;
          const cargoNeeded = (count / 10).toFixed(2);
          passengerCargoInfo.textContent = `(${cargoNeeded} tons)`;
        });

        document.getElementById('load-passengers-btn').addEventListener('click', async () => {
          hideTradeError();

          const count = parseInt(passengerInput.value);

          if (count <= 0) {
            showTradeError('Please enter a number of passengers to load.');
            return;
          }

          const result = await _api.invoke('load-passengers', {
            stellarObjectId: stellarObject.id,
            passengerCount: count
          });

          if (result.success) {
            _addMessage(result.message);
            closeModal();
            await _updateLocationDisplay();
            await _updateShipStatus();
          } else {
            showTradeError(result.message);
          }
        });
      }

      const passengersInCargo = cargo.passengers || 0;
      const passengersInCargoSection = document.getElementById('passengers-in-cargo-section');

      if (passengersInCargo > 0) {
        passengersInCargoSection.classList.remove('hidden');

        const passengersInCargoInfo = document.getElementById('passengers-in-cargo-info');
        passengersInCargoInfo.textContent = `You have ${passengersInCargo.toLocaleString()} passengers on board.`;

        const unloadPassengerInput = document.getElementById('unload-passenger-count');
        const unloadPassengerCargoInfo = document.getElementById('unload-passenger-cargo-info');

        const availablePopulationSpace = population.limit - population.current;
        const maxUnloadPassengers = Math.min(passengersInCargo, availablePopulationSpace);

        unloadPassengerInput.max = maxUnloadPassengers;
        unloadPassengerInput.value = 0;

        unloadPassengerInput.addEventListener('input', () => {
          const count = parseInt(unloadPassengerInput.value) || 0;
          const cargoFreed = (count / 10).toFixed(2);
          unloadPassengerCargoInfo.textContent = `(frees ${cargoFreed} tons)`;
        });

        document.getElementById('unload-passengers-btn').addEventListener('click', async () => {
          hideTradeError();

          const count = Math.floor(unloadPassengerInput.valueAsNumber);

          if (isNaN(count) || count <= 0) {
            showTradeError('Please enter a valid number of passengers to unload.');
            return;
          }

          const result = await _api.invoke('unload-passengers', {
            stellarObjectId: stellarObject.id,
            passengerCount: count
          });

          if (result.success) {
            _addMessage(result.message);
            closeModal();
            await _updateLocationDisplay();
            await _updateShipStatus();
          } else {
            showTradeError(result.message);
          }
        });

        document.getElementById('unload-all-passengers-btn').addEventListener('click', async () => {
          hideTradeError();

          const result = await _api.invoke('unload-passengers', {
            stellarObjectId: stellarObject.id,
            passengerCount: maxUnloadPassengers
          });

          if (result.success) {
            _addMessage(result.message);
            closeModal();
            await _updateLocationDisplay();
            await _updateShipStatus();
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
   * Format the build cost text shown in the buildings modal.
   * @param {Object} buildCost - Building build cost details.
   * @returns {string} Human-readable build cost string.
   */
  function formatBuildingCost(buildCost) {
    const credits = Number(buildCost?.credits || 0).toLocaleString();
    const goods = Object.entries(buildCost?.goods || {})
      .map(([goodName, quantity]) => `${quantity} ${goodName}`)
      .join(', ');
    return goods ? `${credits} cr, ${goods}` : `${credits} cr`;
  }

  /**
   * Build a short description of what a building provides.
   * @param {Object} buildingData - Building definition data.
   * @returns {string} Summary of non-zero effects.
   */
  function formatBuildingBenefits(buildingData) {
    const benefits = [];
    const maxCannonOutput = Array.isArray(buildingData?.cannonBurstOutput)
      ? Number(buildingData.cannonBurstOutput[1] || 0)
      : 0;

    if (Number(buildingData?.storage || 0) > 0) benefits.push(`Storage +${buildingData.storage}`);
    if (Number(buildingData?.energyStorage || 0) > 0) benefits.push(`Energy Storage +${buildingData.energyStorage}`);
    if (Number(buildingData?.shieldsMaxCharge || 0) > 0) benefits.push(`Shield Capacity +${buildingData.shieldsMaxCharge}`);
    if (Number(buildingData?.shieldsChargeRate || 0) > 0) benefits.push(`Shield Recharge +${buildingData.shieldsChargeRate}`);
    if (maxCannonOutput > 0) benefits.push(`Cannon Output +${maxCannonOutput}`);
    if (Number(buildingData?.bankSavings || 0) > 0) benefits.push(`Savings Rate +${buildingData.bankSavings}%`);
    if (Number(buildingData?.bankLoans || 0) > 0) benefits.push(`Loan Capacity +${buildingData.bankLoans}`);
    if (Number(buildingData?.manufactorUnits || 0) > 0) benefits.push(`Factory Units +${buildingData.manufactorUnits}`);
    if (Number(buildingData?.farming || 0) > 0) benefits.push(`Farming +${buildingData.farming}`);
    if (Number(buildingData?.mining || 0) > 0) benefits.push(`Mining +${buildingData.mining}`);
    if (Number(buildingData?.recycling || 0) > 0) benefits.push(`Recycling +${buildingData.recycling}`);
    if (Number(buildingData?.waterPurification || 0) > 0) benefits.push(`Water Purification +${buildingData.waterPurification}`);
    if (Number(buildingData?.airPurification || 0) > 0) benefits.push(`Air Purification +${buildingData.airPurification}`);

    return benefits.length > 0 ? benefits.join(' • ') : 'No direct production bonuses';
  }

  /**
   * Resolve image path for building thumbnails.
   * @param {string} imagePath - Relative image path from building data.
   * @param {string} dataDirectory - Configured game data directory.
   * @returns {string} Path suitable for renderer image src.
   */
  function getBuildingImageSrc(imagePath, dataDirectory) {
    if (!imagePath) {
      return '';
    }
    return `../${dataDirectory}/${imagePath}`;
  }

  /**
   * Open the buildings modal for the current local object.
   * @param {Object} stellarObject - Current docked or landed stellar object.
   * @param {Object[]} buildableBuildings - Buildable building metadata.
   */
  async function openBuildingsModal(stellarObject, buildableBuildings = []) {
    await loadModal('Buildings', './modals/buildings.html', async () => {
      const locationNameEl = document.getElementById('buildings-location-name');
      if (locationNameEl) {
        locationNameEl.textContent = stellarObject?.name || '';
      }

      const buildingsList = document.getElementById('buildings-list');
      if (!buildingsList) {
        return;
      }

      buildingsList.innerHTML = '';

      if (!Array.isArray(buildableBuildings) || buildableBuildings.length === 0) {
        const noBuildings = document.createElement('p');
        noBuildings.textContent = 'No buildings available at this location.';
        buildingsList.appendChild(noBuildings);
        return;
      }

      let dataDirectory = 'data/default/en-us';
      try {
        const settings = await _api.getGameSettings();
        if (settings?.data_directory) {
          dataDirectory = settings.data_directory;
        }
      } catch (error) {
        window.logger.error('Error loading game settings for building images:', error);
      }

      const buildingItemTemplate = await window.gameHelpers.loadTemplate('./templates/building-item.html');

      buildableBuildings.forEach((building) => {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = buildingItemTemplate;
        const item = wrapper.firstElementChild;

        item.querySelector('.building-name').textContent = building.type;
        item.querySelector('.building-cost').textContent = formatBuildingCost(building.buildCost);
        item.querySelector('.building-benefits').textContent = formatBuildingBenefits(building.data || {});

        const imageEl = item.querySelector('.building-image');
        const imageSrc = getBuildingImageSrc(building.image, dataDirectory);
        if (imageSrc) {
          imageEl.src = imageSrc;
          imageEl.alt = `${building.type} image`;
        } else {
          imageEl.classList.add('hidden');
        }

        const builtMarker = item.querySelector('.building-built-marker');
        const buildButton = item.querySelector('.building-build-btn');
        if (building.isBuilt) {
          builtMarker.classList.remove('hidden');
          buildButton.classList.add('hidden');
        } else {
          builtMarker.classList.add('hidden');
          buildButton.classList.remove('hidden');
          buildButton.addEventListener('click', () => {
            closeModal();
            if (window.navigationHandlers?.handleBuild) {
              window.navigationHandlers.handleBuild(building.type);
            } else {
              _api.send('construct-building', building.type);
            }
          });
        }

        buildingsList.appendChild(item);
      });
    });
  }

  /**
   * Open the universe map modal and display the universe visualization.
   */
  async function openUniverseMapModal() {
    await loadModal('Universe Map', './modals/universe-map.html', async () => {
      const modalContent = document.querySelector('.modal-content');
      if (modalContent) {
        modalContent.classList.add('wide');
      }

      const mapData = await _api.getUniverseMapData();
      if (!mapData) return;

      const { systems, stellarObjects, exploredSystems } = mapData;

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

      const nodes = systems.map(sys => ({
        id: sys.id,
        name: sys.name,
        type: systemType[sys.id],
        explored: exploredSystems.includes(sys.id)
      }));

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

      renderUniverseMap(nodes, links, systems, stellarObjects, exploredSystems);
    });
  }

  /**
   * Open the jump planner modal for planning multi-hop routes.
   */
  async function openJumpPlanner() {
    const locationState = await _api.getLocationState();
    if (!locationState) return;

    if (locationState.playerState?.dockedAt != null || locationState.playerState?.landedOn != null) {
      _addMessage('message:jump_planner.docked_or_landed');
      return;
    }

    const allSystems = await _api.invoke('get-all-systems');
    const currentSystemId = locationState.playerState.location;

    if (!allSystems || !Array.isArray(allSystems) || allSystems.length === 0) {
      _addMessage('message:jump_planner.no_systems_data');
      window.logger.error('[DEBUG openJumpPlanner] allSystems:', allSystems);
      return;
    }

    await loadModal('Jump Planner', './modals/jump-planner.html', async () => {
      document.getElementById('current-system-display').textContent = `System ${currentSystemId}`;

      document.getElementById('calculate-route-btn').addEventListener('click', async () => {
        const destinationId = parseInt(document.getElementById('destination-system').value);
        window.logger.debug('[DEBUG calculate-route] destinationId:', destinationId, 'currentSystemId:', currentSystemId);

        const routeDisplay = document.getElementById('route-display');

        if (isNaN(destinationId) || destinationId < 1) {
          await displayErrorMessage(routeDisplay, 'Please enter a valid system ID.');
          return;
        }

        if (destinationId === currentSystemId) {
          await displayErrorMessage(routeDisplay, 'You are already at this system.');
          return;
        }

        const systemExists = allSystems.some(sys => sys.id === destinationId);
        if (!systemExists) {
          await displayErrorMessage(routeDisplay, 'System ID does not exist.');
          return;
        }

        const result = await _api.invoke('calculate-jump-route', {
          start: currentSystemId,
          destination: destinationId
        });
        window.logger.debug('[DEBUG calculate-route] result:', result);

        if (!result.success) {
          await displayErrorMessage(routeDisplay, result.reason);
          return;
        }

        const template = await window.gameHelpers.loadTemplate('./modals/jump-route-display.html');
        document.getElementById('route-display').innerHTML = template;

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

        if (result.energyRequired > result.currentEnergy) {
          document.getElementById('route-energy-warning').hidden = false;
          document.getElementById('confirm-jump-route-btn').disabled = true;
        }

        document.getElementById('confirm-jump-route-btn')?.addEventListener('click', () => {
          closeModal();
          _executeJumpSequence(route);
        });

        document.getElementById('cancel-jump-route-btn')?.addEventListener('click', () => {
          closeModal();
        });
      });
    });
  }

  /**
   * Render the universe map with D3.js force simulation.
   * @param {Array} nodes - Array of system nodes.
   * @param {Array} links - Array of connections between systems.
   * @param {Array} systems - Full system data.
   * @param {Array} stellarObjects - All stellar objects.
   * @param {Array} exploredSystems - List of explored system IDs.
   */
  function renderUniverseMap(nodes, links, systems, stellarObjects, exploredSystems) {
    const diagramElement = document.getElementById('universe-map-diagram');
    const width = diagramElement.clientWidth || 600;
    const height = diagramElement.clientHeight || 500;

    const types = Array.from(new Set(stellarObjects.map(obj => obj.type)));
    const color = d3.scaleOrdinal()
      .domain(types)
      .range(d3.schemeCategory10);

    d3.select('#universe-map-diagram').selectAll('*').remove();

    const svg = d3.select('#universe-map-diagram')
      .append('svg')
      .attr('class', 'universe-svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .style('width', '100%')
      .style('height', '100%');

    const container = svg.append('g');

    const zoom = d3.zoom()
      .scaleExtent([0.2, 5])
      .on('zoom', (event) => {
        container.attr('transform', event.transform);
      });

    svg.call(zoom);

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

    /**
     * Create D3 drag behavior for simulation nodes.
     * @param {Object} simulation - D3 force simulation.
     * @returns {Object} D3 drag behavior.
     */
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
   * Display details about a clicked system in the map sidebar.
   * @param {Object} systemNode - The clicked system node.
   * @param {Array} systems - Full system data.
   * @param {Array} stellarObjects - All stellar objects.
   * @param {Array} exploredSystems - List of explored system IDs.
   */
  async function showSystemDetails(systemNode, systems, stellarObjects, exploredSystems) {
    const detailsDiv = document.getElementById('system-details');
    const system = systems.find(s => s.id === systemNode.id);

    if (!system) {
      detailsDiv.textContent = 'System not found';
      return;
    }

    const template = await window.gameHelpers.loadTemplate('./templates/system-details.html');
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

    const systemObjects = stellarObjects.filter(obj => obj.location === system.id);
    const objectsList = document.getElementById('stellar-objects-list');
    objectsList.innerHTML = '';

    if (systemObjects.length > 0) {
      const itemTemplate = await window.gameHelpers.loadTemplate('./templates/stellar-object-item.html');
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

    const connections = Object.keys(system.connections)
      .map(id => `System ${id}`)
      .join(', ');
    document.getElementById('system-connections').textContent = connections || 'None';
  }

  const api = {
    init,
    loadModal,
    closeModal,
    displayErrorMessage,
    openPlayerStatusModal,
    openCorporationStatusModal,
    openCompanyManagementModal,
    openTradeModal,
    openBuildingsModal,
    openUniverseMapModal,
    openJumpPlanner,
    renderUniverseMap,
    showSystemDetails
  };

  if (typeof window !== 'undefined') {
    window.modalManager = api;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
