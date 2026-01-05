# Copilot / Coding Agent Instructions — Repository Onboarding

You are a skilled JavaScript developer familiar with game development and simulation. When making changes, ensure that all existing tests pass and add new tests for any new functionality. Follow the existing code style and conventions used in the project.

## Purpose

This file documents practical, actionable guidance for an automated coding agent (or a new contributor) working in this repository. It focuses on reproducible developer workflows, CI parity, and minimal, safe edits.

## Quick Summary

- **Project**: Space trading game with economy simulation built with Electron (main + renderer)
- **Languages**: JavaScript (ES6+), HTML5, CSS3
- **Tests**: Jest with dual environments (node for `src/`, jsdom for `app/`)
- **Linting**: ESLint (neostandard), Prettier

### Environment

- Electron: 36.x
- Node: 22.x
- npm: >=10
- Dependencies: d3 (visualization), uuid (IDs)

## Architecture Overview

### Process Model (Electron-specific)

This is a **multi-process Electron app** with strict security boundaries:

1. **Main Process** ([main.js](main.js)) - Node.js environment
   - Manages game state via `currentGame` global variable
   - Window lifecycle and IPC handlers
   - File system access (saves, data loading)
   - Game logic coordination through Game/Universe instances

2. **Renderer Process** (`app/*.html`, `app/*.js`) - Browser environment
   - NO direct Node.js access (contextIsolation enabled)
   - ALL main process communication via [app/preload.js](app/preload.js) bridge
   - UI updates and user interaction handling

3. **Preload Script** ([app/preload.js](app/preload.js)) - Secure IPC bridge
   - Whitelisted channels only (see `validChannels` arrays)
   - Pattern: renderer calls `window.api.send()` or `window.api.invoke()`
   - **Critical**: When adding new IPC, update THREE places:
     1. preload.js validChannels array
     2. main.js ipcMain handler (use `ipcMain.on` for send, `ipcMain.handle` for invoke)
     3. renderer JS file calling the API

### Core Game Logic (`src/`)

Backend modules run in main process only:

- **[src/game.js](src/game.js)** - Central state manager
  - `Game` class: Tracks universe, player, NPCs, corporations, turn/tick counters
  - `Player` class: Location, ship stats, cargo, credits, docked/landed state
  - `NPC` class: AI traders
  - Methods: `initializeGame()`, `jump()`, `dock()`, `land()`, `takeoff()`, `advanceTicks()`
  - Uses `EventBus` for tick events

- **[src/universe.js](src/universe.js)** - World generation
  - `Universe`: Container for systems and stellar objects
  - `System`: Star systems with connections (jump routes graph)
  - `createUniverse()`: Procedural generation function
  - Graph algorithms: `findShortestPath()` for jump route planning

- **[src/stellarObject.js](src/stellarObject.js)** - Stellar object class (planets, stations, asteroids)
  - `StellarObject`: Full state tracking for each location
  - **Capabilities**: `market`, `buildings`, `shipyard`, `shields`, `cannons`, `fighters`, `resistance` (booleans indicating what CAN be done)
  - **Population**: Object with `{ current, limit, growthRate }` - starts at percentage of limit based on `initialPopulationPercent` range, grows automatically each tick
  - **Buildings**: Object tracking built buildings by type: `{ "Warehouse": { count: 2 }, "Mine": { count: 1 } }`
  - **Construction Queue**: Array of buildings under construction: `[{ type: "Mine", ticksRemaining: 5 }]` - advances automatically each tick
  - **Shields/Cannons**: Calculated from built Shield Generator/Cannon buildings (not direct counts)
  - **Fighters**: Integer count, starts at 0
  - **Market/Shipyard State**: Objects tracking inventory, prices, construction queues when capability enabled
  - **Productivity Modifiers**: 0-10 ratings for `metal`, `food`, `chemicals`, `energy` - modify production building effectiveness
  - Methods: `addBuilding(type, buildingsData)` (queues construction), `removeBuilding()`, `getShieldStrength()`, `getCannonStrength()`, `addFighters()`, `updatePopulation()`, `calculateValue()`, `onTick(data)` (automatic time-based updates)
  - **EventBus Integration**: Subscribes to tick events during game initialization for automatic updates (population growth, construction advancement)

- **[src/corporation.js](src/corporation.js)** - Economic entities
  - Tracks owned assets (stellar objects, ships, goods inventory)
  - Asset valuation methods
  - Player and NPC corporations

- **[src/eventBus.js](src/eventBus.js)** - Pub/sub event system
  - Methods: `on()`, `once()`, `emit()`, `clear()`, `listenerCount()`
  - **Subscriber Interface**: `subscribe(eventName, subscriber)` - object-based subscription where subscriber implements `onEventName()` methods (e.g., `onTick()`, `onGameEnd()`)
  - Used for tick events: `eventBus.emit('tick', { ticks, action })`
  - Listeners auto-unsubscribe with returned function
  - Subscribers auto-unsubscribe with `unsubscribe(eventName, subscriber)`

- **[src/actor.js](src/actor.js), [src/producer.js](src/producer.js), [src/consumer.js](src/consumer.js), [src/economy.js](src/economy.js)** - Economic simulation (placeholder/WIP)

### Game Data System

All game content is data-driven from `data/default/en-us/`:

- **game_settings.json** - Core config (starting ship, credits, data directory path)
- **game_messages.json** - Localized text with token replacement (e.g., `{playerName}`, `{systemName}`)
  - Load with: `addMessage('messages:game_start')` (group) or `addMessage('message:navigation.jump_success', { systemName })`
- **ships.json**, **goods.json**, **buildings.json**, **stellarObjects.json** - Game content definitions
- **images/** - Asset files organized by type/class

To support new languages/variants, copy entire `data/default/en-us/` directory and update `data_directory` in game_settings.json.

### UI Structure (`app/`)

- **index.html** - Main menu
- **new_game.html/js** - Universe creation (parameters) → player_creation flow
- **player_creation.html/js** - Character creation form → initializes game
- **game.html/js** - Main gameplay interface
  - Location display with dynamic images
  - Ship status panel
  - Action buttons (context-sensitive: jump/dock/land/takeoff)
  - Console for messages (uses template system)
  - Modals: player status, corporation status, jump planner

- **Shared patterns**:
  - Load HTML templates from `app/templates/` or `app/modals/` via `fetch()`
  - Never embed HTML in JS strings
  - CSS files in `app/css/` (one per page + shared)

### Time System

- **Ticks**: Fundamental time unit (not turns)
- Actions consume ticks: jumping (1-20 varies), docking (1), landing (1), takeoff (1)
- `game.advanceTicks(n)` triggers `eventBus.emit('tick', { ticks, action })`
- Systems subscribe to tick events for automatic time-based updates:
  - Stellar objects update population, advance construction, produce goods
  - Subscribers implement `onTick(data)` method called automatically each tick
  - Subscriptions registered during `initializeGame()` and `loadGame()`

## Developer Workflows

### Running Locally

```bash
npm start          # Launch Electron app
npm test           # Run all tests (Jest)
npm run lint       # Check code style
```

### Testing

- **Jest config**: [jest.config.js](jest.config.js) - Two projects (node + jsdom)
- Tests colocated: `*.test.js` next to source files
- Node environment: `src/**/*.test.js`, [main.test.js](main.test.js)
- JSDOM environment: `app/**/*.test.js` (simulates browser)
- Helper pattern: See `createTestPlayerData()` in [src/game.test.js](src/game.test.js#L6-L17)
- E2E test: [app/game.e2e.test.js](app/game.e2e.test.js) (integration-style test)

### Debugging IPC Issues

1. Check [app/preload.js](app/preload.js) - Is channel whitelisted in both `send`/`invoke` validChannels AND `receive`?
2. Check [main.js](main.js) - Is there a matching `ipcMain.on()` or `ipcMain.handle()`?
3. Check renderer - Using correct API? `window.api.send()` (fire-and-forget) vs `window.api.invoke()` (returns Promise)
4. Console logs: Main process logs in terminal, renderer logs in DevTools

### Game State Management

- **Critical**: `currentGame` in [main.js](main.js#L152) is the single source of truth
- Flow: Universe created → Player created → `currentGame = new Game(universe, settings)` → `initializeGame(playerData)`
- State access: `currentGame.getCurrentLocationState()`, `currentGame.getPlayerState()`
- Save/load: [main.js](main.js) handles file I/O, serializes game state to JSON in `saves/` directory

## Project-Specific Conventions

### Code Style

- **Strict equality only**: Use `===` and `!==` (never `==` or `!=`)
- **No HTML in JS**: Always `fetch()` templates, never string concatenation
- **Variable declarations**: `const` for immutable, `let` for mutable (avoid `var`)
- **Callbacks**: Arrow functions for anonymous functions/callbacks
- **String interpolation**: Template literals with `${variable}` not concatenation

### Function Documentation

All functions must have:

- JSDoc comment with description
- `@param` tags with types
- `@returns` tag when applicable
- Example usage in comments

Example from [src/eventBus.js](src/eventBus.js#L10-L17):

```javascript
/**
 * Subscribe to an event
 * @param {string} eventName - Name of the event to listen for
 * @param {Function} callback - Function to call when event is emitted
 * @returns {Function} Unsubscribe function
 */
on(eventName, callback) { /* ... */ }
```

### Security Practices

- **Renderer isolation**: Never enable `nodeIntegration` or `enableRemoteModule`
- **CSP headers**: Set in [main.js](main.js#L142-L146) for new windows
- **Preload whitelist**: Only add channels that need cross-process communication
- **Input validation**: Validate user input in both renderer (UI) and main (security)

### Message Display Pattern

Use message template system instead of hardcoded strings:

```javascript
// Bad
consoleDiv.textContent += 'Jumping to ' + systemName;

// Good
addMessage('message:navigation.jump_success', { systemName });
```

### Testing Expectations

When modifying code:

1. Run existing tests first: `npm test`
2. Add tests for new functionality (colocate in same directory)
3. Mock external dependencies (universe, settings) - see [src/game.test.js](src/game.test.js#L22-L70)
4. Test both success and error paths
5. Clean up (no "Perfect!" in commit messages)

## Common Pitfalls

1. **Forgetting to update preload.js** when adding IPC channels
2. **Mixing process contexts** - `require()` doesn't work in renderer without preload bridge
3. **Hardcoding file paths** - Always use `path.join(__dirname, ...)` and respect `data_directory` setting
4. **Not handling async** - IPC `invoke()` returns Promise, must await
5. **Mutating stellarObjects directly** - Use methods like `setOwner()` to maintain consistency
6. **Breaking message token replacement** - Ensure tokens match `game_messages.json` format

## Key Files Reference

- [main.js](main.js) - Electron main process, IPC handlers, game state manager
- [app/preload.js](app/preload.js) - IPC whitelist and bridge
- [src/game.js](src/game.js) - Core game logic and player state
- [src/universe.js](src/universe.js) - World generation and graph algorithms
- [src/eventBus.js](src/eventBus.js) - Event system for game-wide notifications
- [jest.config.js](jest.config.js) - Test configuration (dual environments)
- [data/default/en-us/game_settings.json](data/default/en-us/game_settings.json) - Game configuration
- [data/default/en-us/game_messages.json](data/default/en-us/game_messages.json) - Localized text templates
