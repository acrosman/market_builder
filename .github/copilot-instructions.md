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
  - Methods: `initializeGame()`, `jump()`, `dock()`, `land()`, `takeoff()`, `advanceTicks()`
  - Uses `EventBus` for tick events

- **[src/trader.js](src/trader.js)** - Base class for entities that trade and move
  - `Trader` class: Common functionality for Player and NPC
  - Properties: `id`, `location`, `ship`, `credits`, `cargo`
  - Methods: `moveTo()`, `addCargo()`, `removeCargo()`, `canAfford()`, `addCredits()`, `removeCredits()`, `getCargoQuantity()`
  - Both Player and NPC extend this class
  - **Usage**: Always use Trader methods instead of direct property manipulation for credits and cargo

- **[src/player.js](src/player.js)** - Player character (extends Trader)
  - Additional properties: `dockedAt`, `landedOn`, `shipEnergy`, `shipMaxEnergy`, `energyPerJump`, `energyRecharge`, `stats`
  - Filesystem access for loading ship data
  - Inherits all Trader methods for movement and cargo management

- **[src/npc.js](src/npc.js)** - AI traders (extends Trader)
  - Additional properties: `type`, `homeSystem`, `currentSystem` (alias for `location`)
  - Overrides `moveTo()` to keep `currentSystem` synchronized
  - Inherits all Trader methods for movement and cargo management

- **[src/universe.js](src/universe.js)** - World generation
  - `Universe`: Container for systems and stellar objects
  - `System`: Star systems with connections (jump routes graph)
  - `createUniverse()`: Procedural generation function
  - Graph algorithms: `findShortestPath()` for jump route planning

- **[src/stellarObject.js](src/stellarObject.js)** - Stellar object class (planets, stations, asteroids)
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

- **[src/corporation.js](src/corporation.js)** - Economic entities
  - Tracks owned assets (stellar objects, ships, goods inventory)
  - Asset valuation methods
  - Player and NPC corporations

- **[src/market.js](src/market.js)** - Market and trading system
  - `Market` class: Manages all trading, pricing, and market initialization
  - Methods: `initializeMarkets()`, `updatePrices()`, `processTrade()`
  - Populates `marketState` for stellar objects with market capability
  - Determines which goods to stock based on productivity modifiers
  - Dynamic pricing based on supply/demand
  - Integrates with stellar objects' productivity ratings

- **[src/eventBus.js](src/eventBus.js)** - Pub/sub event system
  - **Direct listener methods**: `on(eventName, callback)`, `once()`, `emit()`, `clear()`, `listenerCount()`
  - **Subscriber interface**: `subscribe(eventName, subscriber)` - object-based subscription where subscriber implements `onEventName()` methods (e.g., `onTick()`, `onGameEnd()`)
  - Used for tick events: `eventBus.emit('tick', { ticks, action })`
  - Direct listeners unsubscribe with returned function: `const unsubscribe = eventBus.on('tick', cb); unsubscribe();`
  - Subscribers unsubscribe with `eventBus.unsubscribe('tick', subscriber)`
  - **Pattern choice**: Use subscriber interface for objects with lifecycle (StellarObject), direct `on()` for simple callbacks

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
  - **Modal pattern**: Fetch from `app/modals/`, create overlay div, append modal content, add close handlers
  - **Data directory pattern**: Thread `dataDir` parameter through constructors (defaults to `data/default/en-us`), use `path.join(__dirname, '..', dataDir, 'file.json')` for file access

### Template Loading Pattern

When building dynamic UI content, **always** use HTML templates:

1. **Create template file**: Place in `app/templates/` or `app/modals/`
2. **Load template**: `const template = await fetch('./templates/file.html').then(r => r.text())`
3. **Insert into DOM**: `container.innerHTML = template` or create wrapper div
4. **Populate data**: Use `querySelector()` and `textContent` to fill in dynamic values

**Example**:

```javascript
// Load template
const itemTemplate = await fetch('./templates/item.html').then((r) => r.text());
const itemDiv = document.createElement('div');
itemDiv.innerHTML = itemTemplate;
const item = itemDiv.firstElementChild;

// Populate with data
item.querySelector('#item-name').textContent = name;
item.querySelector('#item-price').textContent = price;

// Add to DOM
container.appendChild(item);
```

**Why**: Separates presentation (HTML) from logic (JS), maintains security (prevents XSS), supports localization, and keeps code maintainable.

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
- **No HTML in JS**: Always `fetch()` templates, never string concatenation or `innerHTML` with template literals
  - ❌ **NEVER**: `element.innerHTML = '<div>...' + variable + '...</div>'`
  - ❌ **NEVER**: ``element.innerHTML = `<div>...${variable}...</div>` ``
  - ❌ **NEVER**: `element.outerHTML = ...`, `document.write()`, or any HTML string building
  - ✅ **ALWAYS**: `fetch('./templates/file.html')` then populate with `textContent` or `querySelector()`
  - Create template files in `app/templates/` or `app/modals/`
  - Use `document.createElement()` and `textContent` for dynamic text
  - Use template loading pattern: fetch template → insert into DOM → populate with `querySelector()` and `textContent`
- **Error handling**: Wrap async operations in try-catch, especially template loading:
  ```javascript
  try {
    const template = await fetch('./templates/file.html').then((r) => r.text());
    // ... use template
  } catch (error) {
    console.error('Error loading template:', error);
    // Fallback behavior
  }
  ```
- **No hardcoded UI strings**: Never embed user-facing text directly in JavaScript
  - ❌ **NEVER**: `addMessage('Error: something went wrong')`
  - ❌ **NEVER**: `element.textContent = 'Click here to continue'`
  - ✅ **ALWAYS**: Load from `game_messages.json` using `addMessage('message:key', { variables })`
  - Static labels in HTML templates are acceptable (e.g., form labels, button text in templates)
  - Exception: System/technical strings for developers (console.log, error handling) are OK
- **Variable declarations**: `const` for immutable, `let` for mutable (avoid `var`)
- **Callbacks**: Arrow functions for anonymous functions/callbacks
- **String interpolation**: Template literals with `${variable}` for logging/technical strings only, not UI content
- **Console logging**: Use `[DEBUG functionName]` prefix for debug logs: `console.log('[DEBUG updateLocationDisplay] value:', value)`
- **Show/hide UI elements**: Use `.hidden` CSS class with `classList.add('hidden')` and `classList.remove('hidden')` - never inline styles

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
4. **Create reusable test helpers**: Extract common mock setup into helper functions (see `createTestPlayerData()`) rather than duplicating across test files
5. Test both success and error paths
6. Verify tests pass after changes
7. **Never use praise language**: No "Perfect!", "Great!", "Excellent!", "Looking good!", or similar affirmations in responses, commit messages, or code comments - these waste tokens and provide no value

## What NOT to Do (Anti-Patterns)

### Process and Architecture Violations

1. **Don't modify game state in renderer process** - All state changes must go through IPC to main process
2. **Don't use Node.js APIs in renderer** - Use preload bridge for file system, path operations, etc.
3. **Don't enable nodeIntegration or enableRemoteModule** - Security boundary must stay intact
4. **Don't bypass Trader methods** - Never directly manipulate `credits` or `cargo` properties; use `addCredits()`, `removeCargo()`, etc.
5. **Don't mutate stellarObjects directly** - Use provided methods (`setOwner()`, `addBuilding()`) to maintain consistency

### Code Quality Violations

6. **Don't use synchronous file operations in renderer** - Always async, and prefer IPC calls to main process
7. **Don't read files in small chunks repeatedly** - Read larger sections to minimize tool calls
8. **Don't duplicate test setup** - Create reusable helper functions for common mocks
9. **Don't forget error handling** - Always wrap async operations, especially template loading and IPC calls
10. **Don't use `==` or `!=`** - Only strict equality (`===`, `!==`)

### UI and Content Violations

11. **Don't embed HTML in JavaScript strings** - No `innerHTML` with template literals, string concatenation, `outerHTML`, or `document.write()`
12. **Don't hardcode user-facing text** - Load from `game_messages.json` via `addMessage()`
13. **Don't use inline styles for show/hide** - Use `.hidden` CSS class
14. **Don't break message token replacement** - Ensure tokens match `game_messages.json` format exactly

### Development Process Violations

15. **Don't forget to update preload.js** - When adding IPC channels, update THREE places (preload validChannels, main handler, renderer call)
16. **Don't hardcode file paths** - Always use `path.join(__dirname, ...)` and respect `data_directory` setting
17. **Don't forget to await async operations** - IPC `invoke()` returns Promise
18. **Don't use praise language** - No "Perfect!", "Great!", "Excellent!", etc. in any output

## Common Pitfalls

1. **Forgetting to update preload.js** when adding IPC channels (must update 3 places)
2. **Mixing process contexts** - `require()` doesn't work in renderer without preload bridge
3. **Hardcoding file paths** - Always use `path.join(__dirname, ...)` and respect `data_directory` setting
4. **Not handling async** - IPC `invoke()` returns Promise, must await
5. **Confusing capabilities with state** - `capabilities.shields` (boolean) vs `getShieldStrength()` (calculated value)
6. **Breaking message token replacement** - Ensure tokens match `game_messages.json` format

## Performance and Efficiency Expectations

1. **Parallelize independent operations**: When reading multiple files, searching different areas, or gathering unrelated context, make tool calls in parallel rather than sequentially
2. **Read larger file sections**: Prefer reading 50-100 lines at once over making many 10-line reads
3. **Batch related edits**: Use `multi_replace_string_in_file` when making multiple independent edits
4. **Minimize tool calls**: Gather sufficient context in one pass before implementing changes
5. **Use appropriate search tools**:
   - `grep_search` for exact strings/patterns within known file locations
   - `semantic_search` for concept-based queries across workspace
   - `file_search` for finding files by name/path pattern
6. **Don't over-search**: If initial results are insufficient, refine query or increase `maxResults` rather than making many small searches

## Key Files Reference

- [main.js](main.js) - Electron main process, IPC handlers, game state manager
- [app/preload.js](app/preload.js) - IPC whitelist and bridge
- [src/game.js](src/game.js) - Core game logic and player state
- [src/universe.js](src/universe.js) - World generation and graph algorithms
- [src/market.js](src/market.js) - Market initialization, trading, and dynamic pricing
- [src/stellarObject.js](src/stellarObject.js) - Stellar object state and capabilities management
- [src/eventBus.js](src/eventBus.js) - Event system for game-wide notifications
- [jest.config.js](jest.config.js) - Test configuration (dual environments)
- [data/default/en-us/game_settings.json](data/default/en-us/game_settings.json) - Game configuration
- [data/default/en-us/game_messages.json](data/default/en-us/game_messages.json) - Localized text templates
