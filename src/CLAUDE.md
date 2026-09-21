Overview of src files. These are backend modules that only run on the main process.

- **src/game.js** - Central state manager
  - `Game` class: Tracks universe, player, NPCs, corporations, turn/tick counters
  - Methods: `initializeGame()`, `jumpToSystem()`, `dockAtStation()`, `landOnPlanet()`, `takeOff()`, `advanceTicks()`
  - Uses `EventBus` for tick events
  - **Accessors**: All `Game` state is reached through accessor methods. Never read or
    write `game.player`, `game.universe`, `game.turn`, etc. directly from outside the class.
    - Read: `getUniverse()`, `getSettings()`, `getDataDirectory()`, `getEventBus()`, `getMarket()`,
      `getEconomy()`, `getPlayer()`, `getNPCs()`, `getCorporations()`, `getTurn()`, `getTicks()`,
      `getExploredSystems()`
    - Write: `setPlayer()`, `setNPCs()`, `addNPC()`, `setCorporations()`,
      `addCorporation()`, `setTurn()`, `setTicks()`, `setExploredSystems()`, `addExploredSystem()`
    - `universe`, `settings`, `eventBus`, `market`, and `economy` are session-scoped collaborators
      set in the constructor and have no setters. `Market` caches its own universe reference and
      stellar objects subscribe to tick events at setup, so swapping either on a live `Game`
      would desync them — build a new `Game` instead (that is what `loadGame()` does).
      `loadGame()` passes restored economy state in via the constructor's `options.economy`.
    - Lookups: `findCorporation(name)`, `findStellarObject(id)`, `hasExploredSystem(id)`
    - Setters validate types and throw `TypeError` on bad input; the array getters
      (`getNPCs()`, `getCorporations()`, `getExploredSystems()`) return shallow copies, so
      use `addNPC()`/`addCorporation()`/`addExploredSystem()` to append
  - **Messages**: `getMessage(key, vars, fallback)` resolves localized result text from
    `game_messages.json`. All `reason`/`message` values returned to the renderer go through it.
  - **Serialization**: `getSaveData()`, `saveGame()`, and `static loadGame()`, with
    `static deserializeUniverse()`, `static deserializePlayer()`, `static deserializeCorporation()`

- **src/trader.js** - Base class for entities that trade and move
  - `Trader` class: Common functionality for Player and NPC
  - Properties: `id`, `location`, `ship`, `credits`, `cargo`
  - Methods: `moveTo()`, `addCargo()`, `removeCargo()`, `canAfford()`, `addCredits()`, `removeCredits()`, `getCargoQuantity()`
  - Both Player and NPC extend this class
  - **Usage**: Always use Trader methods instead of direct property manipulation for credits and cargo

- **src/player.js** - Player character (extends Trader)
  - Additional properties: `dockedAt`, `landedOn`, `shipEnergy`, `shipMaxEnergy`, `energyPerJump`, `energyRecharge`, `stats`
  - Filesystem access for loading ship data
  - Inherits all Trader methods for movement and cargo management

- **src/npc.js** - AI traders (extends Trader)
  - Additional properties: `type`, `homeSystem`, `currentSystem` (alias for `location`)
  - Overrides `moveTo()` to keep `currentSystem` synchronized
  - Inherits all Trader methods for movement and cargo management

- **src/universe.js** - World generation
  - `Universe`: Container for systems and stellar objects
  - `System`: Star systems with connections (jump routes graph)
  - `createUniverse()`: Procedural generation function
  - Graph algorithms: `findShortestPath()` for jump route planning

- **src/stellarObject.js** - Stellar object class (planets, stations, asteroids)
  - `StellarObject`: Full state tracking for each location
  - **Capabilities**: Boolean flags in `capabilities` object indicating what CAN exist: `{ market: true, buildings: true, shipyard: false, shields: true, ... }`
  - **Important distinction**: `capabilities.shields` (boolean, CAN have shields) vs `getShieldStrength()` (calculated number from built Shield Generator buildings)
  - **Population**: Object with `{ current, limit, growthRate }` - starts at percentage of limit based on `initialPopulationPercent` range, grows automatically each tick
  - **Buildings**: Object tracking built buildings by type: `{ "Warehouse": { count: 2 }, "Mine": { count: 1 } }`
  - **Construction Queue**: Array of buildings under construction: `[{ type: "Mine", ticksRemaining: 5 }]` - advances automatically each tick
  - **Shields/Cannons**: NOT direct properties - calculated via `getShieldStrength()` and `getCannonStrength()` from Shield Generator/Cannon building counts
  - **Fighters**: Integer count stored directly, starts at 0, modified via `addFighters()`
  - **Market/Shipyard State**: Objects tracking inventory, prices, construction queues when capability enabled
  - **Productivity Modifiers**: 0-10 ratings for `metal`, `food`, `chemicals`, `energy` - modify production building effectiveness
  - Methods: `addBuilding(type, buildingsData)` (queues construction), `removeBuilding()`, `getShieldStrength()`, `getCannonStrength()`, `addFighters()`, `updatePopulation()`, `calculateValue()`, `onTick(data)` (automatic time-based updates)
  - **EventBus Integration**: Subscribes to tick events during game initialization for automatic updates (population growth, construction advancement)

- **src/corporation.js** - Economic entities
  - Tracks owned assets (stellar objects, ships, goods inventory), cash, loans and solvency state
  - **`calculateTotalValue()` is net of debt; `calculateTotalAssetValue()` is gross.** Borrowing
    must not raise reported value, and net worth may legitimately be negative
  - `getCreditRating(universe)` ladders on leverage, not the size of the debt, and takes the
    universe so collateral counts. `Corporation.RATING_ORDER` orders the ladder
  - `cashReserves` is a projection of the ledger, set via `setCashPosition()`, and may be
    negative. The ledger is the source of truth for cash
  - Player and NPC corporations

- **src/market.js** - Market and trading system
  - `Market` class: Manages all trading, pricing, and market initialization
  - Methods: `initializeMarkets()`, `updatePrices()`, `processTrade()`
  - Populates `marketState` for stellar objects with market capability
  - Determines which goods to stock based on productivity modifiers
  - Dynamic pricing based on supply/demand
  - Integrates with stellar objects' productivity ratings

- **src/contentCache.js** - Cached loader for `data/<pack>/<locale>/` content files
  - `loadContent(fileName, dataDirectory)` returns parsed, deep-frozen JSON, cached by path
  - **Use this instead of `fs.readFileSync` for content files.** They never change while the
    game runs, and per-tick production reads them constantly
  - Deliberately not used for save files (always read fresh), `universe.js` name lookups
    (re-read on purpose for tests), or `windowManager.js` (its tests mock `fs`)

- **src/economy/** - Economy and exchange simulation (in progress)
  - **economyState.js** - `EconomyState`, the container for all economy/exchange state.
    Owns its own `schemaVersion` and serializes itself under the save file's `economy` key.
    Reached via `game.getEconomy()`. Everything the economy owns belongs here rather than as
    new top-level save fields, because `getSaveData()` serializes live instances while the
    deserializers copy hand-maintained field lists — new fields are written but silently
    not restored. New economy subsystems hang off this object.
  - **accounts.js** - Chart of accounts and holder identity (`holderKey`, `corporationHolder`,
    `marketHolder`, `playerHolder`, plus the bank, external-galaxy and investor-pool singletons)
  - **ledger.js** - Double-entry journal. Every money or goods movement posts here with both
    legs named, which is what makes money conservation structural rather than hoped for.
    `audit()` verifies incremental balances against a full journal replay
  - **costBasis.js** - Weighted-average inventory cost per holder per good, so COGS and gross
    margin are real. Selling out releases exactly the recorded cost, leaving no rounding residue
  - **transactions.js** - Multi-leg recorders (`recordGoodsTrade`, `recordLoanDraw`,
    `recordConstructionSpend`, `recordAssetTransfer`, ...). **Post through these, not the ledger
    directly**, so the ledger and cost basis cannot drift apart. `recordAssetTransfer` books
    every transfer at *appraised* value with any difference to contributed capital and never to
    income, which is what stops self-dealing between commonly controlled companies from
    manufacturing earnings
  - **clock.js** - Tick/day/quarter/year conversions from `game_settings.json` `time` block
  - **production.js** - Per-tick goods extraction, operating costs, and population food demand.
    Raw extraction only: no building has manufacturing recipes yet (see issue #32)
  - **restock.js** - Markets drift toward ideal stock by trading with the wider galaxy, which
    gives prices their mean reversion and stops local economies dead-locking at zero
  - **appraisal.js** - What things are *worth*, as distinct from what they cost. Discounted
    cash flows at prevailing goods prices, with output capped by input supply.
    **This module must never see a share price.** It does not import the exchange, takes no
    price argument, and tests enforce that on three axes. If it could read a share price while
    the market priced companies on appraised book value, the two would drive each other.
    Also holds `defaultProbability()`, which makes the balloon cliff priceable, and
    `discountRateFor()`. Its level is currently ~2.5x the simulation's; see the module header
  - **solvency.js** - Deficit grace window, forced loans, and bankruptcy. `bookNetWorth()` reads
    the ledger directly
  - **statements.js** - Quarterly income statement and balance sheet derived from the journal.
    Only closed quarters publish; a quarter in progress is deliberately invisible
  - **economyTicker.js** - The single `'tick'` subscriber driving the economy: interest accrual
    every tick, then production/consumption/restock, solvency, the share auction, and book
    close on day boundaries

- **src/exchange/** - The share exchange
  - **instruments.js** - What can be listed. Equity only today; the seam exists so commodity
    instruments (futures on goods) can be listed alongside shares without reworking the book,
    the auction or the holdings register. **Settlement branches on instrument kind**, so a new
    tradeable is a new branch rather than an edit to the equity path. Expiry, delivery, margin
    and mark-to-market are deliberately absent
  - **auction.js** - Periodic call clearing: one price per market cycle, chosen to maximize
    executed volume. Ties break toward the smaller imbalance, then the reference price, so the
    outcome depends on the book and not on iteration order
  - **listing.js** - One instrument's order book and price history. Orders rest across clears
    and across saves; history is a fixed-length ring
  - **portfolio.js** - Signed positions by holder and symbol, plus the cap table. Personal,
    corporate and public holdings share one register
  - **exchange.js** - Listings, order submission, and settlement. **Short selling is refused**,
    including selling the same shares twice across two orders; it needs borrow, margin and a
    forced cover first. Listings are keyed by symbol, which for equity is the company name
  - **conservation.js** - The money invariant: **total cash equals total injected**. Every
    credit enters the game the same way, debited to a holder's CASH against that holder's
    CONTRIBUTED_CAPITAL; everything else moves credits sideways. `checkConservation()` says
    precisely when a subsystem has learned to create or destroy money, and
    `injectionsByReason()` names which inflow grew
  - **dividends.js** - Paying shareholders out of a quarter's *earnings*, never out of cash on
    hand. A company that lost money pays nothing however much cash it holds; paying out of
    capital is how a treasury gets drained into shareholders' pockets while the business fails
  - **rng.js** - `RandomSource` / `RandomStream`, seeded and serializable PRNG.
    **All new economy, exchange, and agent code must use this, never `Math.random()`.**
    Streams are named (`random.stream('price-noise')`) and independent: a stream's seed is
    derived by hashing its name with the master seed, so adding a new stream never shifts an
    existing one's sequence. Mulberry32 state is one 32-bit integer, so save/load resumes a
    sequence exactly.
    **Universe generation is deliberately non-deterministic and will stay that way** -- worlds
    are meant to differ between games. Parts of the exchange may become non-deterministic too
    as it grows. Reproducibility is a property of individual seeded streams, not a
    whole-simulation guarantee, so do not write tests that assume two games agree.

- **src/eventBus.js** - Pub/sub event system
  - **Direct listener methods**: `on(eventName, callback)`, `once()`, `emit()`, `clear()`, `listenerCount()`
  - **Subscriber interface**: `subscribe(eventName, subscriber)` - object-based subscription where subscriber implements `onEventName()` methods (e.g., `onTick()`, `onGameEnd()`)
  - Used for tick events: `eventBus.emit('tick', { ticks, delta, action })`, where `ticks` is
    the cumulative game clock and `delta` is the ticks elapsed in this event (always 1 today).
    Time-based subscribers must use `delta`; see the Time System section in the root `CLAUDE.md`
  - Direct listeners unsubscribe with returned function: `const unsubscribe = eventBus.on('tick', cb); unsubscribe();`
  - Subscribers unsubscribe with `eventBus.unsubscribe('tick', subscriber)`
  - **Pattern choice**: Use subscriber interface for objects with lifecycle (StellarObject), direct `on()` for simple callbacks

- **src/agents/** - The actors the player does not control
  - **corporateAI.js** - The 8-20 corporations that own real worlds, produce real goods and keep
    real books, so their statements summarize what happened rather than a stochastic process
    dressed as one. Policy is deliberately simple -- hold a cash buffer, develop the least
    developed world -- because the worlds differ, so one policy yields divergent results
  - **investorPool.js** - The investing public, modelled as **several distinct investors rather
    than one**. That is not cosmetic: a single holder cannot trade with itself, so a one-holder
    pool can only ever be on one side of the market and the book never crosses. Capital is
    finite and tracked in the ledger, so the public can run out and a market can lose its bid.
    Beliefs come from appraisal, which cannot see a share price, so price cannot feed on itself
