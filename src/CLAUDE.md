Overview of src files. These are backend modules that only run on the main process.

- **src/game.js** - Central state manager
  - `Game` class: Tracks universe, player, NPCs, corporations, turn/tick counters
  - Methods: `initializeGame()`, `jump()`, `dock()`, `land()`, `takeoff()`, `advanceTicks()`
  - Uses `EventBus` for tick events

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
  - Tracks owned assets (stellar objects, ships, goods inventory)
  - Asset valuation methods
  - Player and NPC corporations

- **src/market.js** - Market and trading system
  - `Market` class: Manages all trading, pricing, and market initialization
  - Methods: `initializeMarkets()`, `updatePrices()`, `processTrade()`
  - Populates `marketState` for stellar objects with market capability
  - Determines which goods to stock based on productivity modifiers
  - Dynamic pricing based on supply/demand
  - Integrates with stellar objects' productivity ratings

- **src/eventBus.js** - Pub/sub event system
  - **Direct listener methods**: `on(eventName, callback)`, `once()`, `emit()`, `clear()`, `listenerCount()`
  - **Subscriber interface**: `subscribe(eventName, subscriber)` - object-based subscription where subscriber implements `onEventName()` methods (e.g., `onTick()`, `onGameEnd()`)
  - Used for tick events: `eventBus.emit('tick', { ticks, action })`
  - Direct listeners unsubscribe with returned function: `const unsubscribe = eventBus.on('tick', cb); unsubscribe();`
  - Subscribers unsubscribe with `eventBus.unsubscribe('tick', subscriber)`
  - **Pattern choice**: Use subscriber interface for objects with lifecycle (StellarObject), direct `on()` for simple callbacks
