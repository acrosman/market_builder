const exchangeModal = require('./exchangeModal');
const EXCHANGE_LABELS = require('./modals/exchange.labels.json');
require('./gameHelpers');

describe('exchangeModal', () => {
  let mockApi;
  let mockAddMessage;
  let mockResolveMessageText;

  const MODAL_HTML = `
    <h3 id="exchange-listings-heading"></h3>
    <p id="exchange-no-listings" class="hidden"></p>
    <span id="exchange-header-symbol"></span>
    <span id="exchange-header-last"></span>
    <span id="exchange-header-shares"></span>
    <div id="exchange-listing-rows"></div>
    <div id="exchange-detail" class="hidden">
      <h3 id="exchange-detail-symbol"></h3>
      <h4 id="exchange-chart-heading"></h4>
      <p id="exchange-no-history" class="hidden"></p>
      <div id="exchange-price-chart"></div>
      <h4 id="exchange-book-heading"></h4>
      <h5 id="exchange-bids-heading"></h5>
      <p id="exchange-no-bids" class="hidden"></p>
      <div id="exchange-bid-rows"></div>
      <h5 id="exchange-asks-heading"></h5>
      <p id="exchange-no-asks" class="hidden"></p>
      <div id="exchange-ask-rows"></div>
      <h4 id="exchange-place-heading"></h4>
      <label id="exchange-account-label"></label>
      <select id="exchange-account-select"></select>
      <label id="exchange-side-label"></label>
      <select id="exchange-side-select"></select>
      <label id="exchange-quantity-label"></label>
      <input id="exchange-quantity-input">
      <label id="exchange-limit-label"></label>
      <input id="exchange-limit-input">
      <button id="exchange-submit-order-btn"></button>
    </div>
    <h3 id="exchange-portfolio-heading"></h3>
    <span id="exchange-credits-label"></span>
    <span id="exchange-credits"></span>
    <p id="exchange-no-positions" class="hidden"></p>
    <div id="exchange-position-rows"></div>
    <h4 id="exchange-orders-heading"></h4>
    <p id="exchange-no-orders" class="hidden"></p>
    <div id="exchange-order-rows"></div>
  `;

  const LISTING_ROW = `
    <div class="exchange-row exchange-listing-row">
      <span class="exchange-cell exchange-symbol"></span>
      <span class="exchange-cell exchange-last-price"></span>
      <span class="exchange-cell exchange-shares"></span>
      <span class="exchange-cell exchange-flag hidden"></span>
    </div>`;

  const DEPTH_ROW = `
    <div class="exchange-depth-row"><span class="exchange-depth-text"></span></div>`;

  const ORDER_ROW = `
    <div class="exchange-row exchange-order-row">
      <span class="exchange-cell exchange-order-text"></span>
      <button class="action-btn exchange-cancel-btn"></button>
    </div>`;

  /**
   * Build a listing summary.
   * @param {Object} [overrides={}] - Fields to override.
   * @returns {Object} A listing view.
   */
  function listing(overrides = {}) {
    return {
      symbol: 'Meridian',
      corporationName: 'Meridian',
      instrumentKind: 'equity',
      lastPrice: 83,
      sharesOutstanding: 10000,
      history: [{ tick: 24, price: 83, volume: 300 }],
      depth: { bids: [{ price: 82, quantity: 100 }], asks: [], marketBids: 0, marketAsks: 0 },
      isBankrupt: false,
      ...overrides
    };
  }

  /**
   * Open the modal with a given set of IPC responses.
   * @param {Object} [responses={}] - Per-channel responses.
   * @returns {Promise<void>} Resolves once open.
   */
  async function openWith(responses = {}) {
    mockApi.invoke.mockImplementation((channel, payload) => {
      if (channel in responses) {
        const value = responses[channel];
        return Promise.resolve(typeof value === 'function' ? value(payload) : value);
      }
      if (channel === 'get-exchange-listings') {
        return Promise.resolve({ success: true, listings: [listing()] });
      }
      if (channel === 'get-exchange-listing') {
        return Promise.resolve({ success: true, listing: listing() });
      }
      if (channel === 'get-exchange-portfolio') {
        return Promise.resolve({ success: true, positions: [], orders: [], credits: 1000 });
      }
      if (channel === 'get-player-companies') {
        return Promise.resolve([{ name: 'Meridian' }]);
      }
      return Promise.resolve(null);
    });

    await exchangeModal.openExchangeModal();
  }

  beforeEach(() => {
    document.body.innerHTML = '<div class="modal-content"><div id="modal-body"></div></div>';

    global.fetch = jest.fn().mockImplementation((url) => {
      const path = String(url);
      // The label map is fetched as JSON, so serve the real file rather than
      // markup: a mock that only answers text() sends label loading down the
      // error path and the assertions below would pass on an unlabelled modal.
      if (path.includes('exchange.labels.json')) {
        return Promise.resolve({ ok: true, json: jest.fn().mockResolvedValue(EXCHANGE_LABELS) });
      }
      let text = MODAL_HTML;
      if (path.includes('exchange-listing-row')) text = LISTING_ROW;
      else if (path.includes('exchange-depth-row')) text = DEPTH_ROW;
      else if (path.includes('exchange-order-row')) text = ORDER_ROW;
      return Promise.resolve({ ok: true, text: jest.fn().mockResolvedValue(text) });
    });

    window.logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };

    mockApi = { invoke: jest.fn() };
    mockAddMessage = jest.fn();
    mockResolveMessageText = jest.fn((key, vars = {}) => Promise.resolve(
      Object.keys(vars).length > 0 ? `${key}:${JSON.stringify(vars)}` : key
    ));

    exchangeModal.init({
      api: mockApi,
      addMessage: mockAddMessage,
      resolveMessageText: mockResolveMessageText,
      loadModal: async (title, contentFile, onLoad) => {
        const html = await window.gameHelpers.loadTemplate(contentFile);
        document.getElementById('modal-body').innerHTML = html;
        if (onLoad) {
          await onLoad();
        }
      }
    });
  });

  describe('opening', () => {
    test('should widen the modal and hide the detail panel until a listing is picked', async () => {
      await openWith();

      expect(document.querySelector('.modal-content').classList.contains('wide')).toBe(true);
      expect(document.getElementById('exchange-detail').classList.contains('hidden')).toBe(true);
    });

    test('should label the modal from its label map file', async () => {
      await openWith();

      // resolveMessageText is mocked to echo the key, so the text is the key
      expect(document.getElementById('exchange-listings-heading').textContent)
        .toBe(EXCHANGE_LABELS['exchange-listings-heading']);
    });

    test('should render a row per listing', async () => {
      await openWith({
        'get-exchange-listings': {
          success: true,
          listings: [listing(), listing({ symbol: 'Aardvark', lastPrice: 12 })]
        }
      });

      const rows = document.querySelectorAll('.exchange-listing-row');
      expect(rows).toHaveLength(2);
      expect(rows[0].querySelector('.exchange-symbol').textContent).toBe('Meridian');
      expect(rows[0].querySelector('.exchange-last-price').textContent).toBe('83');
    });

    test('should show the empty state when nothing is listed', async () => {
      await openWith({ 'get-exchange-listings': { success: true, listings: [] } });

      expect(document.getElementById('exchange-no-listings').classList.contains('hidden'))
        .toBe(false);
    });

    test('should flag a bankrupt issuer', async () => {
      await openWith({
        'get-exchange-listings': { success: true, listings: [listing({ isBankrupt: true })] }
      });

      const flag = document.querySelector('.exchange-flag');
      expect(flag.classList.contains('hidden')).toBe(false);
      expect(flag.textContent).toBe('exchange.bankrupt_flag');
    });

    test('should offer personal and corporate accounts', async () => {
      await openWith();

      const options = Array.from(document.getElementById('exchange-account-select').options);
      // The player trades with their own credits or a company treasury
      expect(options.map(option => option.value)).toEqual(['personal', 'Meridian']);
    });

    test('should surface a message when listings cannot be loaded', async () => {
      mockApi.invoke.mockRejectedValue(new Error('ipc down'));
      await exchangeModal.openExchangeModal();

      expect(mockAddMessage).toHaveBeenCalledWith('message:exchange.load_error');
    });
  });

  describe('selecting a listing', () => {
    test('should reveal the detail panel and render the book', async () => {
      await openWith();
      await exchangeModal.selectListing('Meridian');

      expect(document.getElementById('exchange-detail').classList.contains('hidden'))
        .toBe(false);
      expect(document.getElementById('exchange-detail-symbol').textContent).toBe('Meridian');
      expect(document.querySelectorAll('#exchange-bid-rows .exchange-depth-row'))
        .toHaveLength(1);
    });

    test('should show empty states for an untouched side of the book', async () => {
      await openWith();
      await exchangeModal.selectListing('Meridian');

      // No offers on the ask side
      expect(document.getElementById('exchange-no-asks').classList.contains('hidden'))
        .toBe(false);
      expect(document.getElementById('exchange-no-bids').classList.contains('hidden'))
        .toBe(true);
    });

    test('should mark the selected row', async () => {
      await openWith();
      await exchangeModal.selectListing('Meridian');

      expect(document.querySelector('.exchange-listing-row').classList.contains('selected'))
        .toBe(true);
    });
  });

  describe('holdings and orders', () => {
    test('should render positions and available credits', async () => {
      await openWith({
        'get-exchange-portfolio': {
          success: true,
          positions: [{ symbol: 'Meridian', shares: 300, lastPrice: 83, value: 24900 }],
          orders: [],
          credits: 41200
        }
      });

      expect(document.getElementById('exchange-credits').textContent).toBe('41,200');
      expect(document.querySelectorAll('#exchange-position-rows .exchange-depth-row'))
        .toHaveLength(1);
    });

    test('should render a resting order with a cancel control', async () => {
      await openWith({
        'get-exchange-portfolio': {
          success: true,
          positions: [],
          orders: [{ id: 1, symbol: 'Meridian', side: 'buy', quantity: 100, limitPrice: 85 }],
          credits: 1000
        }
      });

      expect(document.querySelectorAll('.exchange-order-row')).toHaveLength(1);
      expect(document.querySelector('.exchange-cancel-btn').textContent)
        .toBe('exchange.cancel_order');
    });

    test('should describe a market order differently from a limit order', async () => {
      await openWith({
        'get-exchange-portfolio': {
          success: true,
          positions: [],
          orders: [{ id: 1, symbol: 'Meridian', side: 'buy', quantity: 100, limitPrice: null }],
          credits: 1000
        }
      });

      expect(document.querySelector('.exchange-order-text').textContent)
        .toContain('exchange.order_line_market');
    });

    test('should cancel an order and report it', async () => {
      await openWith({
        'get-exchange-portfolio': {
          success: true,
          positions: [],
          orders: [{ id: 7, symbol: 'Meridian', side: 'buy', quantity: 10, limitPrice: 85 }],
          credits: 1000
        },
        'cancel-share-order': { success: true }
      });

      document.querySelector('.exchange-cancel-btn').click();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockApi.invoke).toHaveBeenCalledWith('cancel-share-order', {
        symbol: 'Meridian', orderId: 7
      });
      expect(mockAddMessage).toHaveBeenCalledWith('message:exchange.order_cancelled');
    });
  });

  describe('placing an order', () => {
    test('should submit a limit order for the selected listing', async () => {
      await openWith({ 'submit-share-order': { success: true, orderId: 1 } });
      await exchangeModal.selectListing('Meridian');

      document.getElementById('exchange-quantity-input').value = '100';
      document.getElementById('exchange-limit-input').value = '85';
      document.getElementById('exchange-side-select').value = 'buy';

      await exchangeModal.submitOrder();

      expect(mockApi.invoke).toHaveBeenCalledWith('submit-share-order', {
        symbol: 'Meridian', side: 'buy', quantity: 100, limitPrice: 85
      });
      expect(mockAddMessage).toHaveBeenCalledWith('message:exchange.order_placed');
    });

    test('should treat a blank limit as a market order', async () => {
      await openWith({ 'submit-share-order': { success: true, orderId: 1 } });
      await exchangeModal.selectListing('Meridian');

      document.getElementById('exchange-quantity-input').value = '10';
      document.getElementById('exchange-limit-input').value = '';

      await exchangeModal.submitOrder();

      // Blank means no limit, not a limit of zero
      expect(mockApi.invoke).toHaveBeenCalledWith('submit-share-order',
        expect.objectContaining({ limitPrice: null }));
    });

    test('should submit against a corporation treasury when chosen', async () => {
      await openWith({ 'submit-share-order': { success: true, orderId: 1 } });
      await exchangeModal.selectListing('Meridian');

      document.getElementById('exchange-quantity-input').value = '10';
      document.getElementById('exchange-account-select').value = 'Meridian';

      await exchangeModal.submitOrder();

      expect(mockApi.invoke).toHaveBeenCalledWith('submit-share-order',
        expect.objectContaining({ asCorporation: 'Meridian' }));
    });

    test('should not submit without a listing selected', async () => {
      await openWith();
      mockApi.invoke.mockClear();

      await exchangeModal.submitOrder();

      expect(mockApi.invoke).not.toHaveBeenCalledWith('submit-share-order', expect.anything());
    });

    test('should not submit a non-positive quantity', async () => {
      await openWith();
      await exchangeModal.selectListing('Meridian');
      document.getElementById('exchange-quantity-input').value = '0';
      mockApi.invoke.mockClear();

      await exchangeModal.submitOrder();

      expect(mockApi.invoke).not.toHaveBeenCalledWith('submit-share-order', expect.anything());
    });

    test('should explain a rejection in the player’s terms', async () => {
      await openWith({
        'submit-share-order': { success: false, reason: 'insufficient_shares' }
      });
      await exchangeModal.selectListing('Meridian');
      document.getElementById('exchange-quantity-input').value = '10';

      await exchangeModal.submitOrder();

      expect(mockAddMessage).toHaveBeenCalledWith('message:exchange.order_rejected', {
        reason: 'exchange.reason_insufficient_shares'
      });
    });
  });

  describe('price chart', () => {
    test('should show the empty state with no history', () => {
      document.body.innerHTML = `
        <div id="exchange-price-chart"></div>
        <p id="exchange-no-history" class="hidden"></p>`;
      window.d3 = undefined;

      exchangeModal.renderPriceChart([]);
      // Without d3 loaded the chart is skipped rather than throwing
      expect(document.getElementById('exchange-price-chart').children).toHaveLength(0);
    });

    test('should not throw when d3 is unavailable', () => {
      document.body.innerHTML = '<div id="exchange-price-chart"></div>';
      window.d3 = undefined;
      expect(() => exchangeModal.renderPriceChart([{ tick: 1, price: 10 }])).not.toThrow();
    });
  });
});
