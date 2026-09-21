const { playerHolder, corporationHolder } = require('../economy/accounts');

/**
 * Build the logger on demand rather than at module load.
 *
 * windowManager requires this module at the top of the file, and its tests mock
 * the logger. Constructing one here at load time reaches the mock before the
 * test has initialized it.
 * @returns {Object} A scoped logger.
 * @example
 * exchangeLogger().error('failed', error);
 */
function exchangeLogger() {
  const { createLogger } = require('../logger');
  return createLogger('exchange-ipc');
}

/**
 * IPC handlers for the share exchange.
 *
 * Split out of `windowManager.js` rather than added to it. That file already
 * registers every other channel in the game and is close to the size at which
 * this project splits modules, and the exchange adds a cluster of related
 * channels that belong together.
 */

/**
 * Resolve the holder a renderer request is acting as.
 *
 * The player trades personally with their own credits and corporations trade
 * from their treasuries, so a request has to say which. Defaulting to the
 * player is the safe reading: it spends the requester's own money rather than
 * a company's.
 * @param {Object} game - The active game.
 * @param {Object} payload - Request payload, possibly naming a corporation.
 * @returns {Object|null} Holder reference, or null when unresolvable.
 * @example
 * const holder = resolveHolder(game, { asCorporation: 'Meridian' });
 */
function resolveHolder(game, payload = {}) {
  if (payload.asCorporation) {
    const corporation = game.findCorporation(payload.asCorporation);
    return corporation ? corporationHolder(corporation) : null;
  }

  const player = game.getPlayer();
  return player ? playerHolder(player) : null;
}

/**
 * Build the renderer-facing view of one listing.
 * @param {Object} game - The active game.
 * @param {Object} listing - The listing to summarize.
 * @returns {Object} Listing summary.
 * @example
 * const view = buildListingView(game, listing);
 */
function buildListingView(game, listing) {
  const exchange = game.getEconomy().getExchange();
  const corporation = listing.corporationName
    ? game.findCorporation(listing.corporationName)
    : null;

  return {
    symbol: listing.symbol,
    corporationName: listing.corporationName,
    instrumentKind: listing.instrument?.kind || null,
    lastPrice: listing.lastPrice,
    sharesOutstanding: listing.sharesOutstanding,
    history: listing.history,
    depth: listing.depth(),
    isBankrupt: Boolean(corporation?.isBankrupt)
  };
}

/**
 * Register every exchange channel.
 * @param {Object} dependencies - Wiring from the main process.
 * @param {Object} dependencies.ipcMain - Electron ipcMain.
 * @param {Function} dependencies.getCurrentGame - Returns the active game session.
 * @returns {void}
 * @example
 * registerExchangeHandlers({ ipcMain, getCurrentGame });
 */
function registerExchangeHandlers({ ipcMain, getCurrentGame }) {
  // IPC: Every listing on the exchange.
  ipcMain.handle('get-exchange-listings', () => {
    const game = getCurrentGame();
    if (!game) {
      return { success: false, listings: [] };
    }

    const exchange = game.getEconomy().getExchange();
    const listings = [...exchange.listings.values()]
      .map(listing => buildListingView(game, listing))
      .sort((a, b) => String(a.symbol).localeCompare(String(b.symbol)));

    return { success: true, listings };
  });

  // IPC: One listing in detail.
  ipcMain.handle('get-exchange-listing', (event, payload = {}) => {
    const game = getCurrentGame();
    const listing = game?.getEconomy().getExchange().getListing(payload.symbol);

    if (!listing) {
      return { success: false, listing: null };
    }

    return { success: true, listing: buildListingView(game, listing) };
  });

  // IPC: What the requester holds, and their resting orders.
  ipcMain.handle('get-exchange-portfolio', (event, payload = {}) => {
    const game = getCurrentGame();
    if (!game) {
      return { success: false, positions: [], orders: [], credits: 0 };
    }

    const holder = resolveHolder(game, payload);
    if (!holder) {
      return { success: false, positions: [], orders: [], credits: 0 };
    }

    const exchange = game.getEconomy().getExchange();
    const positions = Object.entries(exchange.portfolio.positionsFor(holder))
      .map(([symbol, shares]) => {
        const listing = exchange.getListing(symbol);
        return {
          symbol,
          shares,
          lastPrice: listing?.lastPrice || 0,
          value: (listing?.lastPrice || 0) * shares
        };
      })
      .sort((a, b) => a.symbol.localeCompare(b.symbol));

    const credits = payload.asCorporation
      ? game.findCorporation(payload.asCorporation)?.getTotalCashReserves() || 0
      : game.getPlayer()?.credits || 0;

    return {
      success: true,
      positions,
      orders: exchange.openOrdersFor(holder).map(order => ({
        id: order.id,
        symbol: order.symbol,
        side: order.side,
        quantity: order.quantity,
        filled: order.filled,
        limitPrice: order.limitPrice
      })),
      credits: Math.round(credits)
    };
  });

  // IPC: Place an order. It rests on the book until the next auction.
  ipcMain.handle('submit-share-order', (event, payload = {}) => {
    const game = getCurrentGame();
    if (!game) {
      return { success: false, reason: 'no_game' };
    }

    const holder = resolveHolder(game, payload);
    if (!holder) {
      return { success: false, reason: 'unknown_holder' };
    }

    const result = game.submitShareOrder({
      corporationName: payload.symbol,
      holder,
      side: payload.side,
      quantity: Number(payload.quantity),
      limitPrice: payload.limitPrice === null || payload.limitPrice === undefined
        ? null
        : Number(payload.limitPrice)
    });

    return {
      success: result.accepted,
      reason: result.reason,
      orderId: result.order?.id || null
    };
  });

  // IPC: Withdraw a resting order.
  ipcMain.handle('cancel-share-order', (event, payload = {}) => {
    const game = getCurrentGame();
    if (!game) {
      return { success: false };
    }

    const holder = resolveHolder(game, payload);
    if (!holder) {
      return { success: false };
    }

    return {
      success: game.getEconomy().getExchange()
        .cancelOrder(payload.symbol, Number(payload.orderId), holder)
    };
  });

  // IPC: Take a company public, raising capital.
  ipcMain.handle('list-corporation', (event, payload = {}) => {
    const game = getCurrentGame();
    if (!game) {
      return { success: false, reason: 'no_game' };
    }

    try {
      const result = game.listCorporation(payload.companyName, Number(payload.shares));
      return {
        success: result.success,
        reason: result.reason,
        pricePerShare: result.pricePerShare || 0,
        proceeds: result.proceeds || 0
      };
    } catch (error) {
      exchangeLogger().error('Failed to list corporation:', error);
      return { success: false, reason: 'error' };
    }
  });

  // IPC: Who owns a listed company.
  ipcMain.handle('get-cap-table', (event, payload = {}) => {
    const game = getCurrentGame();
    const listing = game?.getEconomy().getExchange().getListing(payload.symbol);

    if (!listing) {
      return { success: false, holders: [] };
    }

    const exchange = game.getEconomy().getExchange();
    const holders = exchange.portfolio.capTable(listing.symbol).map(row => ({
      kind: row.holder.kind,
      id: row.holder.id,
      shares: row.shares,
      fraction: listing.sharesOutstanding > 0
        ? row.shares / listing.sharesOutstanding
        : 0
    }));

    return { success: true, holders, sharesOutstanding: listing.sharesOutstanding };
  });
}

module.exports = {
  registerExchangeHandlers,
  resolveHolder,
  buildListingView
};
