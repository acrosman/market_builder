# Coding Agent Instructions — Repository Onboarding

Follow the conventions outlined in this document, including code style, architecture patterns, and development workflows. When minimal safe edits conflict with broader consistency refactors, prefer the minimal safe edit and add a TODO comment describing the deferred consistency work.

When in doubt about the best solution or request details ask. Propose potential solutions, but validate before proceeding.

## Quick Summary

- **Project**: Space trading game with economy simulation built with Electron (main + renderer)
- **Languages**: JavaScript (ES6+), HTML5, CSS3
- **Tests**: Jest with dual environments: node for `src/`, jsdom for `app/`
- **Linting**: ESLint, Prettier

### Environment

- Electron: 39.x or greater
- Node: 22.x (recommended; not currently enforced via `package.json` engines)
- npm: >=10 (recommended; not currently enforced via `package.json` engines)
- Dependencies: d3 (visualization), uuid (IDs), electron-log (logger)

## Commands

- Install: npm install
- Run tests: npm test
- Lint: npm run lint
- Start app: npm start
- Check coverage: npm run test:coverage

## Architecture Overview

`app/`, `src/`, and `data/` each have their own `CLAUDE.md` with module-level detail (class responsibilities, data shapes, shared-helper inventories) that this file does not restate. Read the nested file for the directory you're working in alongside this one.

### Process Model (Electron-specific)

This is a **multi-process Electron app** with strict security boundaries:

1. **Main Process** (`main.js`) - Node.js environment

- Window lifecycle, app security, and startup wiring
- File system access (saves, data loading)
- Delegates IPC registration and game/session coordination to `src/windowManager.js`

2. **Window Manager Module** (`src/windowManager.js`) - Main-process IPC registration

- Owns all `ipcMain.on()` and `ipcMain.handle()` registrations
- Contains IPC-specific game/session state for universe and active game setup flow
- Handles routing between renderer IPC calls and main-process game logic

3. **Renderer Process** (`app/*.html`, `app/*.js`) - Browser environment

- NO direct Node.js access (contextIsolation enabled)
- ALL main process communication via `app/preload.js` bridge
- UI updates and user interaction handling

4. **Preload Script** (app/preload.js) - Secure IPC bridge

- Whitelisted channels only (see `validChannels` arrays)
- Pattern: renderer calls `window.api.send()` or `window.api.invoke()`
- **Critical**: When adding new IPC, update THREE places:
  1. preload.js validChannels array
  2. src/windowManager.js ipcMain handler (use `ipcMain.on` for send, `ipcMain.handle` for invoke)
  3. renderer JS file calling the API

### Game Code Structure

- Core Game Logic: `src/` Backend modules run in main process only
- All game content is loaded from from `data/default/en-us/`
- The UI: `app/` All front end display related html templates and JavaScript

### Time System

- **Ticks**: Fundamental time unit (not turns)
- Actions consume ticks: jumping (1-20 varies), docking (1), landing (1), takeoff (1)
- `game.advanceTicks(n)` triggers `eventBus.emit('tick', { ticks, action })`
- Systems subscribe to tick events for automatic time-based updates:
  - Stellar objects update population, advance construction, produce goods
  - Subscribers implement `onTick(data)` method called automatically each tick
  - Subscriptions registered during `initializeGame()` and `loadGame()`

## Developer Workflows

### Testing

- **Jest config**: `jest.config.js` - Two projects (node + jsdom)
- Tests colocated: `*.test.js` next to source files
- Node environment: `src/**/*.test.js`, `main.test.js`
- JSDOM environment: `app/**/*.test.js` (simulates browser)
- Helper pattern: See `createTestPlayerData()` in `src/game.test.js`
- E2E test: `app/game.e2e.test.js` (integration-style test)

### Debugging IPC Issues

1. Check `app/preload.js` - Is channel whitelisted in both `send`/`invoke` validChannels AND `receive`?
2. Check `src/windowManager.js` - Is there a matching `ipcMain.on()` or `ipcMain.handle()`?
3. Check renderer - Using correct API? `window.api.send()` (fire-and-forget) vs `window.api.invoke()` (returns Promise)
   - For `window.api.invoke()` calls, always wrap in `try/catch` and surface failures to users via an `addMessage('message:...')` call using an existing error message key where one fits the failure (for example `save_load.load_dialog_error` for save/load failures). No generic `error.*` namespace exists in `game_messages.json` yet — if no existing key fits, add one following the "No hardcoded UI strings" convention below rather than hardcoding text. Do not silently swallow IPC errors.

### Game State Management

- **Critical**: `currentGame` in `main.js` is the single source of truth
- Flow: Universe created → Player created → `currentGame = new Game(universe, settings)` → `initializeGame(playerData)`
- State access: `currentGame.getCurrentLocationState()`, `currentGame.getPlayerState()`
- Save/load: `main.js` handles file I/O, serializes game state to JSON in `saves/` directory
- If save file reading fails or JSON parsing fails during `loadGame()`, do not set `currentGame`; send a dedicated IPC error event (for example `load-game-error`) and have the renderer display an error via an existing save/load failure message key in `game_messages.json`.

## Project-Specific Conventions

### Code Style

- **Strict equality only**: Use `===` and `!==` (never `==` or `!=`)
- **No HTML in JS**: Always load templates via shared helpers, never string concatenation or `innerHTML` with template literals
  - ❌ **NEVER**: `element.innerHTML = '<div>...' + variable + '...</div>'`
  - ❌ **NEVER**: ``element.innerHTML = `<div>...${variable}...</div>` ``
  - ❌ **NEVER**: `element.outerHTML = ...`, `document.write()`, or any HTML string building
  - ✅ **ALWAYS**: `window.gameHelpers.loadTemplate('./templates/file.html')` then populate with `textContent` or `querySelector()`
  - Create template files in `app/templates/` or `app/modals/`
  - Use `document.createElement()` and `textContent` for dynamic text
  - Use template loading pattern: shared helper load → insert into DOM → populate with `querySelector()` and `textContent`
- **Single implementation rule**: Implement shared utility behavior once and reuse it.
  - ❌ **NEVER**: Re-implement utility logic in multiple files when a shared helper exists.
  - ✅ **ALWAYS**: Route shared utility logic through one canonical helper/module and call that from feature files.
- **Error handling**: Wrap async operations in try-catch, especially template loading:
  ```javascript
  try {
    const template = await window.gameHelpers.loadTemplate('./templates/file.html');
    // ... use template
  } catch (error) {
    console.error('Error loading template:', error);
    // Fallback behavior
  }
  ```
- **No hardcoded UI strings**: Never embed user-facing text directly in JavaScript
  - ❌ **NEVER**: `addMessage('Error: something went wrong')`
  - ❌ **NEVER**: `element.textContent = 'Click here to continue'`
  - ✅ **ALWAYS**: Load from `data/default/en-us/game_messages.json` using `addMessage('message:key', { variables })`
  - When new user-facing text is needed:
    - In `data/default/en-us/game_messages.json`, add it as a nested object entry (example: `"navigation": { "new_action": "Text with {tokenName} placeholders" }`)
    - In code, reference that nested path with dot-notation (example: `addMessage('message:navigation.new_action')`; `message:` is a code-level prefix, not part of the JSON key)
  - Never use a message key that does not exist in `data/default/en-us/game_messages.json`
  - Template HTML should use message keys/placeholders for user-facing text instead of hardcoded literals
  - Exception: System/technical strings for developers (console.log, error handling) are OK, but most be removed before a pull request is approved.
- **Variable declarations**: `const` for immutable, `let` for mutable (avoid `var`)
- **Callbacks**: Arrow functions for anonymous functions/callbacks
- **String interpolation**: Template literals with `${variable}` for logging/technical strings only, not UI content
- **Show/hide UI elements**: Use `.hidden` CSS class with `classList.add('hidden')` and `classList.remove('hidden')` - never inline styles
- **File size and modularity**:
  - Favor cohesive modules by feature or responsibility to prevent “god files”.
  - Files over **500 lines**: before making changes, check whether the file can be split into focused modules; if splitting is safe and in scope, do it.
  - Files over **1000 lines**: split into smaller modules in the same PR unless the files is a configuration JSON file.

### Function Documentation

All functions must have:

- JSDoc comment with description
- `@param` tags with types
- `@returns` tag when applicable
- Example usage in comments

### Security Practices

- **Renderer isolation**: Never enable `nodeIntegration` or `enableRemoteModule`
- **CSP headers**: Set proper CSP header for all windows
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
3. Mock external dependencies (universe, settings) and use helper functions to create test data rather than relying on full game initialization
4. **Create reusable test helpers**: Extract common mock setup into helper functions (see `createTestPlayerData()`) rather than duplicating across test files
5. Test both success and error paths
6. Verify tests pass after changes

## What NOT to Do (Anti-Patterns)

**Never use praise language**: No "Perfect!", "Great!", "Excellent!", "Looking good!", or similar affirmations in responses, commit messages, or code comments - these waste tokens and provide no value

### Process and Architecture Violations

1. **Don't modify game state in renderer process** - All state changes must go through IPC to main process
2. **Don't use Node.js APIs in renderer** - Use preload bridge for file system, path operations, etc.
3. **Don't mutate objects directly** - Use or create accessor methods to maintain consistency
4. **Don't forget to update preload.js** when adding IPC channels update: preload validChannels, main handler, and renderer call
5. **Don't confuse process contexts** - `require()` doesn't work in renderer without preload bridge
6. **No hardcoding file paths** - Always use `path.join(__dirname, ...)` and respect `data_directory` setting
7. **Avoid breaking message token replacement** - Ensure tokens match `game_messages.json` format

### Code Quality Violations

See also Code Style Section above.

1. **Don't use synchronous file operations in renderer** - Always async, and prefer IPC calls to main process
2. **Don't duplicate test setup** - Create reusable helper functions for common mocks
3. **Don't forget error handling** - Always wrap async operations, especially template loading and IPC calls
4. **Never Reimplement shared helper logic** - Use canonical helpers (`window.gameHelpers`) instead of local duplicates in multiple renderer modules

### UI and Content Violations

1. **Don't embed HTML in JavaScript strings** - See Code Style: No HTML in JS rule.
2. **Don't hardcode user-facing text** - Load from `game_messages.json` via `addMessage()`
3. **Don't use inline styles for show/hide** - Use `.hidden` CSS class
4. **Don't break message token replacement** - Ensure tokens match `game_messages.json` format exactly

## Key Files Reference

- `main.js` - Electron main process bootstrap, window creation, and security setup
- `src/windowManager.js` - Centralized IPC listener/handler registration for renderer ↔ main communication
- `app/preload.js` - IPC whitelist and bridge
- `src/game.js` - Core game logic and player state
- `src/trader.js` - Shared base class for `Player`/`NPC`; always use its methods (`addCredits()`, `removeCargo()`, etc.) instead of direct property mutation — see `src/CLAUDE.md`
- `src/player.js` - Player character (extends `Trader`)
- `src/npc.js` - AI traders (extends `Trader`)
- `src/corporation.js` - Economic entities: owned assets and asset valuation
- `src/universe.js` - World generation and graph algorithms
- `src/market.js` - Market initialization, trading, and dynamic pricing
- `src/stellarObject.js` - Stellar object state and capabilities management
- `src/eventBus.js` - Event system for game-wide notifications
- `app/gameHelpers.js` - Canonical shared renderer helper module (`loadTemplate()`, `calculateCargoMass()`, `replaceMessageVariables()`) - see `app/CLAUDE.md`
- `jest.config.js` - Test configuration (dual environments)
- `data/default/en-us/game_settings.json` - Game configuration
- `data/default/en-us/game_messages.json` - Localized text templates
