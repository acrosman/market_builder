(function () {
  // Context references set during init()
  let _api;
  let _addMessage;
  let _resolveMessageText;
  let _loadModal;

  /** Symbol currently shown in the detail panel, or null. */
  let _selectedSymbol = null;

  /**
   * Initialize the exchange modal with shared game context.
   *
   * Kept out of modalManager because that module already carries every other
   * modal in the game and is past the size at which this project splits files.
   * @param {Object} context - Shared game context.
   * @param {Object} context.api - window.api IPC bridge.
   * @param {Function} context.addMessage - Display a message in the console.
   * @param {Function} context.resolveMessageText - Resolve a localized message string.
   * @param {Function} context.loadModal - Load a modal body by path.
   * @returns {void}
   * @example
   * window.exchangeModal.init({ api, addMessage, resolveMessageText, loadModal });
   */
  function init(context) {
    _api = context.api;
    _addMessage = context.addMessage;
    _resolveMessageText = context.resolveMessageText;
    _loadModal = context.loadModal;
  }

  /**
   * Set an element's text from a message key.
   * @param {string} elementId - Element id.
   * @param {string} messageKey - Message key.
   * @param {Object} [vars={}] - Token values.
   * @returns {Promise<void>} Resolves once set.
   */
  async function setText(elementId, messageKey, vars = {}) {
    const element = document.getElementById(elementId);
    if (element) {
      element.textContent = await _resolveMessageText(messageKey, vars);
    }
  }

  /**
   * Apply every static label in the modal.
   *
   * The element-id to message-key map lives in `app/modals/exchange.labels.json`
   * beside the modal markup, so adding a label is a change to the modal's own
   * files rather than to this module.
   * @returns {Promise<void>} Resolves once labelled.
   */
  async function applyLabels() {
    try {
      const labels = await window.gameHelpers.loadLabelMap('./modals/exchange.labels.json');
      await window.gameHelpers.applyLabelMap(labels, _resolveMessageText);
    } catch (error) {
      window.gameHelpers.logClientError('Error loading exchange labels:', error);
    }
  }

  /**
   * Show or hide an element using the shared hidden class.
   * @param {string} elementId - Element id.
   * @param {boolean} visible - Whether it should show.
   * @returns {void}
   */
  function setVisible(elementId, visible) {
    const element = document.getElementById(elementId);
    if (element) {
      element.classList.toggle('hidden', !visible);
    }
  }

  /**
   * Build one row from a template and fill it.
   * @param {string} templatePath - Template to load.
   * @param {Function} populate - Receives the row element.
   * @returns {Promise<Element|null>} The populated row.
   */
  async function buildRow(templatePath, populate) {
    const markup = await window.gameHelpers.loadTemplate(templatePath);
    const wrapper = document.createElement('div');
    wrapper.innerHTML = markup;
    const row = wrapper.firstElementChild;
    if (row) {
      populate(row);
    }
    return row;
  }

  /**
   * Draw the closing price series.
   *
   * The only existing d3 in this project is force-directed maps, so there is no
   * axis or time-series idiom to follow here. This keeps to the same
   * clear-and-redraw approach and uses the d3 already loaded under the page's
   * CSP nonce rather than adding a dependency.
   * @param {Array<Object>} history - Closing prices as `{ tick, price }`.
   * @returns {void}
   */
  function renderPriceChart(history) {
    const container = document.getElementById('exchange-price-chart');
    if (!container || typeof window.d3 === 'undefined') {
      return;
    }

    window.d3.select(container).selectAll('*').remove();
    setVisible('exchange-no-history', history.length === 0);

    if (history.length === 0) {
      return;
    }

    const width = container.clientWidth || 360;
    const height = 140;
    const margin = { top: 8, right: 8, bottom: 20, left: 44 };

    const svg = window.d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height);

    const x = window.d3.scaleLinear()
      .domain(window.d3.extent(history, point => point.tick))
      .range([margin.left, width - margin.right]);

    // A single flat price would collapse the domain to a point, so pad it
    const prices = history.map(point => point.price);
    const low = Math.min(...prices);
    const high = Math.max(...prices);
    const pad = high === low ? Math.max(1, high * 0.1) : 0;

    const y = window.d3.scaleLinear()
      .domain([low - pad, high + pad]).nice()
      .range([height - margin.bottom, margin.top]);

    svg.append('g')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(window.d3.axisBottom(x).ticks(4).tickFormat(tick => `t${tick}`));

    svg.append('g')
      .attr('transform', `translate(${margin.left},0)`)
      .call(window.d3.axisLeft(y).ticks(4));

    svg.append('path')
      .datum(history)
      .attr('fill', 'none')
      .attr('stroke', '#5cb85c')
      .attr('stroke-width', 2)
      .attr('d', window.d3.line()
        .x(point => x(point.tick))
        .y(point => y(point.price)));
  }

  /**
   * Render the list of every listing.
   * @param {Array<Object>} listings - Listing summaries.
   * @returns {Promise<void>} Resolves once rendered.
   */
  async function renderListings(listings) {
    const container = document.getElementById('exchange-listing-rows');
    if (!container) {
      return;
    }

    container.textContent = '';
    setVisible('exchange-no-listings', listings.length === 0);

    for (const listing of listings) {
      const row = await buildRow('./templates/exchange-listing-row.html', element => {
        element.querySelector('.exchange-symbol').textContent = listing.symbol;
        element.querySelector('.exchange-last-price').textContent =
          listing.lastPrice.toLocaleString();
        element.querySelector('.exchange-shares').textContent =
          listing.sharesOutstanding.toLocaleString();
        element.dataset.symbol = listing.symbol;
        if (listing.symbol === _selectedSymbol) {
          element.classList.add('selected');
        }
      });

      if (!row) {
        continue;
      }

      if (listing.isBankrupt) {
        const flag = row.querySelector('.exchange-flag');
        flag.textContent = await _resolveMessageText('exchange.bankrupt_flag');
        flag.classList.remove('hidden');
      }

      row.addEventListener('click', () => {
        selectListing(listing.symbol).catch(error => {
          window.gameHelpers.logClientError('Failed to select listing', error);
        });
      });

      container.appendChild(row);
    }
  }

  /**
   * Render one side of the order book.
   * @param {string} containerId - Element to fill.
   * @param {string} emptyId - Empty-state element.
   * @param {Array<Object>} levels - Price levels.
   * @returns {Promise<void>} Resolves once rendered.
   */
  async function renderDepth(containerId, emptyId, levels) {
    const container = document.getElementById(containerId);
    if (!container) {
      return;
    }

    container.textContent = '';
    setVisible(emptyId, levels.length === 0);

    for (const level of levels) {
      const text = await _resolveMessageText('exchange.depth_line', {
        quantity: level.quantity.toLocaleString(),
        price: level.price.toLocaleString()
      });
      const row = await buildRow('./templates/exchange-depth-row.html', element => {
        element.querySelector('.exchange-depth-text').textContent = text;
      });
      if (row) {
        container.appendChild(row);
      }
    }
  }

  /**
   * Show one listing in the detail panel.
   * @param {string} symbol - Listing symbol.
   * @returns {Promise<void>} Resolves once shown.
   */
  async function selectListing(symbol) {
    let result;
    try {
      result = await _api.invoke('get-exchange-listing', { symbol });
    } catch (error) {
      window.gameHelpers.logClientError('Failed to load listing', error);
      _addMessage('message:exchange.load_error');
      return;
    }

    if (!result?.success) {
      return;
    }

    _selectedSymbol = symbol;
    setVisible('exchange-detail', true);

    const heading = document.getElementById('exchange-detail-symbol');
    if (heading) {
      heading.textContent = result.listing.symbol;
    }

    document.querySelectorAll('.exchange-listing-row').forEach(row => {
      row.classList.toggle('selected', row.dataset.symbol === symbol);
    });

    renderPriceChart(result.listing.history || []);
    await renderDepth('exchange-bid-rows', 'exchange-no-bids', result.listing.depth.bids);
    await renderDepth('exchange-ask-rows', 'exchange-no-asks', result.listing.depth.asks);
  }

  /**
   * Render holdings and resting orders.
   * @returns {Promise<void>} Resolves once rendered.
   */
  async function renderPortfolio() {
    let result;
    try {
      result = await _api.invoke('get-exchange-portfolio', {});
    } catch (error) {
      window.gameHelpers.logClientError('Failed to load portfolio', error);
      _addMessage('message:exchange.load_error');
      return;
    }

    if (!result?.success) {
      return;
    }

    const credits = document.getElementById('exchange-credits');
    if (credits) {
      credits.textContent = result.credits.toLocaleString();
    }

    const positions = document.getElementById('exchange-position-rows');
    if (positions) {
      positions.textContent = '';
      setVisible('exchange-no-positions', result.positions.length === 0);

      for (const position of result.positions) {
        const text = await _resolveMessageText('exchange.position_line', {
          shares: position.shares.toLocaleString(),
          symbol: position.symbol,
          lastPrice: position.lastPrice.toLocaleString()
        });
        const row = await buildRow('./templates/exchange-depth-row.html', element => {
          element.querySelector('.exchange-depth-text').textContent = text;
        });
        if (row) {
          positions.appendChild(row);
        }
      }
    }

    await renderOrders(result.orders);
  }

  /**
   * Render resting orders with a cancel control on each.
   * @param {Array<Object>} orders - Open orders.
   * @returns {Promise<void>} Resolves once rendered.
   */
  async function renderOrders(orders) {
    const container = document.getElementById('exchange-order-rows');
    if (!container) {
      return;
    }

    container.textContent = '';
    setVisible('exchange-no-orders', orders.length === 0);

    const cancelLabel = await _resolveMessageText('exchange.cancel_order');

    for (const order of orders) {
      const sideLabel = await _resolveMessageText(
        order.side === 'buy' ? 'exchange.side_buy' : 'exchange.side_sell'
      );
      // A market order has no limit to show, so it reads differently
      const text = await _resolveMessageText(
        order.limitPrice === null ? 'exchange.order_line_market' : 'exchange.order_line',
        {
          side: sideLabel,
          quantity: order.quantity.toLocaleString(),
          symbol: order.symbol,
          limitPrice: order.limitPrice === null ? '' : order.limitPrice.toLocaleString()
        }
      );

      const row = await buildRow('./templates/exchange-order-row.html', element => {
        element.querySelector('.exchange-order-text').textContent = text;
        element.querySelector('.exchange-cancel-btn').textContent = cancelLabel;
      });

      if (!row) {
        continue;
      }

      row.querySelector('.exchange-cancel-btn').addEventListener('click', () => {
        cancelOrder(order.symbol, order.id).catch(error => {
          window.gameHelpers.logClientError('Failed to cancel order', error);
        });
      });

      container.appendChild(row);
    }
  }

  /**
   * Cancel a resting order and refresh.
   * @param {string} symbol - Listing symbol.
   * @param {number} orderId - Order identifier.
   * @returns {Promise<void>} Resolves once refreshed.
   */
  async function cancelOrder(symbol, orderId) {
    try {
      const result = await _api.invoke('cancel-share-order', { symbol, orderId });
      if (result?.success) {
        _addMessage('message:exchange.order_cancelled');
      }
    } catch (error) {
      window.gameHelpers.logClientError('Failed to cancel order', error);
      _addMessage('message:exchange.load_error');
      return;
    }

    await refresh();
  }

  /**
   * Submit the order the form describes.
   * @returns {Promise<void>} Resolves once submitted and refreshed.
   */
  async function submitOrder() {
    if (!_selectedSymbol) {
      return;
    }

    const quantityInput = document.getElementById('exchange-quantity-input');
    const limitInput = document.getElementById('exchange-limit-input');
    const sideSelect = document.getElementById('exchange-side-select');
    const accountSelect = document.getElementById('exchange-account-select');

    const quantity = Number(quantityInput?.value);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return;
    }

    // A blank limit is a market order rather than a limit of zero
    const rawLimit = limitInput?.value;
    const limitPrice = rawLimit === '' || rawLimit === null || rawLimit === undefined
      ? null
      : Number(rawLimit);

    const payload = {
      symbol: _selectedSymbol,
      side: sideSelect?.value || 'buy',
      quantity,
      limitPrice
    };

    const account = accountSelect?.value;
    if (account && account !== 'personal') {
      payload.asCorporation = account;
    }

    let result;
    try {
      result = await _api.invoke('submit-share-order', payload);
    } catch (error) {
      window.gameHelpers.logClientError('Failed to submit order', error);
      _addMessage('message:exchange.load_error');
      return;
    }

    if (result?.success) {
      _addMessage('message:exchange.order_placed');
      if (quantityInput) {
        quantityInput.value = '';
      }
    } else {
      const reasonKey = `exchange.reason_${result?.reason || 'invalid_order'}`;
      _addMessage('message:exchange.order_rejected', {
        reason: await _resolveMessageText(reasonKey)
      });
    }

    await refresh();
  }

  /**
   * Populate the account and side selectors.
   * @returns {Promise<void>} Resolves once populated.
   */
  async function populateSelectors() {
    const sideSelect = document.getElementById('exchange-side-select');
    if (sideSelect) {
      sideSelect.textContent = '';
      for (const [value, key] of [['buy', 'exchange.side_buy'], ['sell', 'exchange.side_sell']]) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = await _resolveMessageText(key);
        sideSelect.appendChild(option);
      }
    }

    const accountSelect = document.getElementById('exchange-account-select');
    if (!accountSelect) {
      return;
    }

    accountSelect.textContent = '';
    const personal = document.createElement('option');
    personal.value = 'personal';
    personal.textContent = await _resolveMessageText('exchange.account_personal');
    accountSelect.appendChild(personal);

    try {
      const companies = await _api.invoke('get-player-companies');
      (Array.isArray(companies) ? companies : []).forEach(company => {
        const option = document.createElement('option');
        option.value = company.name;
        option.textContent = company.name;
        accountSelect.appendChild(option);
      });
    } catch (error) {
      // A missing company list still leaves personal trading usable
      window.gameHelpers.logClientError('Failed to load companies for exchange', error);
    }
  }

  /**
   * Reload listings, the selected detail, and the portfolio.
   * @returns {Promise<void>} Resolves once refreshed.
   */
  async function refresh() {
    let listingsResult;
    try {
      listingsResult = await _api.invoke('get-exchange-listings');
    } catch (error) {
      window.gameHelpers.logClientError('Failed to load listings', error);
      _addMessage('message:exchange.load_error');
      return;
    }

    const listings = listingsResult?.listings || [];
    if (_selectedSymbol && !listings.some(listing => listing.symbol === _selectedSymbol)) {
      _selectedSymbol = null;
      setVisible('exchange-detail', false);
    }

    await renderListings(listings);
    await renderPortfolio();

    if (_selectedSymbol) {
      await selectListing(_selectedSymbol);
    }
  }

  /**
   * Open the exchange.
   * @returns {Promise<void>} Resolves once open.
   * @example
   * await window.exchangeModal.openExchangeModal();
   */
  async function openExchangeModal() {
    _selectedSymbol = null;
    const title = await _resolveMessageText('exchange.modal_title');

    await _loadModal(title, './modals/exchange.html', async () => {
      const modalContent = document.querySelector('.modal-content');
      if (modalContent) {
        modalContent.classList.add('wide');
      }

      await applyLabels();
      await populateSelectors();
      setVisible('exchange-detail', false);

      const submitButton = document.getElementById('exchange-submit-order-btn');
      if (submitButton) {
        submitButton.addEventListener('click', () => {
          submitOrder().catch(error => {
            window.gameHelpers.logClientError('Failed to submit order', error);
          });
        });
      }

      await refresh();
    });
  }

  const api = {
    init,
    openExchangeModal,
    refresh,
    selectListing,
    submitOrder,
    renderPriceChart
  };

  if (typeof window !== 'undefined') {
    window.exchangeModal = api;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
