# Coding Agent Instructions — Repository Onboarding

Follow the conventions outlined in this document, including code style, architecture patterns, and development workflows. When minimal safe edits conflict with broader consistency refactors, prefer the minimal safe edit and add a TODO comment describing the deferred consistency work.

When in doubt about the best solution or request details ask. Propose potential solutions, but validate before proceeding.

## Quick Summary

- **Project**: Space trading game with a simulated economy and share exchange, built with Electron (main + renderer)
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

`app/`, `src/`, and `data/` each have their own `CLAUDE.md` with module-level detail (class responsibilities, data shapes, shared-helper inventories) that this file does not restate, and `src/economy/`, `src/exchange/`, `src/agents/` and `src/ipc/` each have one as well. Read the nested file for the directory you're working in alongside this one; where a nested file states an invariant, that invariant is binding.

### Process Model (Electron-specific)

This is a **multi-process Electron app** with strict security boundaries:

1. **Main Process** (`main.js`) - Node.js environment

- Window lifecycle, app security, and startup wiring
- File system access (saves, data loading)
- Delegates IPC registration and game/session coordination to `src/windowManager.js`

2. **Window Manager Module** (`src/windowManager.js`) - Main-process IPC registration

- Owns most `ipcMain.on()` and `ipcMain.handle()` registrations, and calls the feature modules in `src/ipc/` that own the rest
- Contains IPC-specific game/session state for universe and active game setup flow
- Handles routing between renderer IPC calls and main-process game logic
- A cluster of related channels large enough to stand on its own moves to `src/ipc/<feature>Handlers.js`, exporting a `register*Handlers({ ipcMain, getCurrentGame })` that this file calls. **Pass the game as a getter, never as a captured value** — `currentGame` is replaced wholesale on new-game and load

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
  - `src/economy/` — production, consumption, the double-entry ledger, statements, solvency, appraisal, and the single tick subscriber that drives them
  - `src/exchange/` — the share market: order books, the periodic call auction, holdings, cap tables, control
  - `src/agents/` — NPC corporations and the investing public
  - `src/ipc/` — feature-clustered IPC handler registration, called from `windowManager.js`
- All game content is loaded from from `data/default/en-us/`
- The UI: `app/` All front end display related html templates and JavaScript

### Time System

- **Ticks**: Fundamental time unit (not turns)
- Actions consume ticks: jumping (1-20 varies), docking (1), landing (1), takeoff (1)
- `game.advanceTicks(n)` emits `n` separate `eventBus.emit('tick', { ticks, delta, action })` events
- **`ticks` vs `delta`** — these are different quantities and must not be confused:
  - `ticks` is the **cumulative** game clock after this tick (1, 2, 3, ...)
  - `delta` is the number of ticks **elapsed in this event**, always 1 today
  - Time-based subscribers (population growth, construction, interest accrual) must use
    `delta`. Using `ticks` as an elapsed amount compounds every update by the whole age
    of the game — this was a real bug, see the regression tests in `src/game.test.js`
    under "real StellarObject subscribed to a real Game"
- Systems subscribe to tick events for automatic time-based updates:
  - Stellar objects update population, advance construction, produce goods
  - Subscribers implement `onTick(data)` method called automatically each tick
  - Subscriptions registered during `initializeGame()` and `loadGame()`

### Economy and Exchange

The economy simulates production and consumption, keeps double-entry books, and prices companies
on an exchange. Four rules cross module boundaries and are enforced by tests. `src/economy/CLAUDE.md`
and `src/exchange/CLAUDE.md` carry the detail; these are the ones to know before touching anything
that moves money.

1. **Money is conserved.** Total cash across every holder equals total credits ever injected.
   Credits enter the game exactly one way — debited to a holder's `CASH` against that same
   holder's `CONTRIBUTED_CAPITAL` — and everything else moves credits sideways between holders.
   A money movement without a counterparty destroys or creates credits and the conservation test
   will find it. This has already caught bugs in construction spend, loan overpayment and restocking.
2. **Post through `src/economy/transactions.js`, never through `ledger.post()` directly.** The
   recorders keep the journal and the inventory cost basis in step. If no recorder fits, add one.
3. **Appraisal must never see a share price.** `src/economy/appraisal.js` does not import the
   exchange and takes no price argument. If it could read a share price while the market priced
   companies on appraised value, the two would drive each other.
4. **Use the seeded RNG, never `Math.random()`**, anywhere in `src/economy/`, `src/exchange/` or
   `src/agents/`. `src/economy/rng.js` provides named, independent, save-restorable streams.
   **Universe generation is deliberately not deterministic and will stay that way** — reproducibility
   is a property of an individual seeded stream, not a whole-simulation guarantee, so do not write
   tests that assume two games agree.

The ledger is the source of truth for cash. `corporation.cashReserves` is a projection of it,
refreshed by the ticker; never adjust it to make a figure come out right.

All economy work runs from one `'tick'` subscriber, `src/economy/economyTicker.js`. Interest
accrues every tick; production, consumption, restocking, solvency, agents, exchange clearing and
book close run on day boundaries in a commented, load-bearing order. **Add new recurring economy
work there rather than subscribing another listener to `'tick'`.**

Tuning lives in `game_settings.json` under `time`, `production`, `restock`, `solvency`,
`statements`, `appraisal`, `npc_corporations`, `investors`, `dividends` and `loan_term_quarters`.
Each module reads its block through a `*Config()` helper with a `DEFAULT_*` fallback, so a missing
block degrades rather than throws and older saves keep loading.

## Developer Workflows

### Testing

- **Jest config**: `jest.config.js` - Two projects (node + jsdom)
- Tests colocated: `*.test.js` next to source files
- Node environment: `src/**/*.test.js`, `main.test.js`
- JSDOM environment: `app/**/*.test.js` (simulates browser)
- Helper pattern: See `createTestPlayerData()` in `src/game.test.js`
- E2E test: `app/game.e2e.test.js` (integration-style test)
- **Conservation harness**: `checkConservation()` is asserted over long tick runs in `src/economy/economyTicker.test.js`, `src/agents/agents.test.js` and `src/agents/distress.test.js`; `src/economy/economyIntegration.test.js` covers the ledger's round trip through individual money movements. When one of these breaks, read the failure's per-holder cash breakdown (`cashByHolder()`) before reading the diff — it names the subsystem that learned to create or destroy credits
- **Never assume two games agree.** Universe generation is not seeded, so a test that builds two games from the same settings and compares them passes by luck. Pin the values you assert on
- **Emergent outcomes need their own tests.** A test that asserts on the end of a simulated year is asserting on a distribution, not a return value. Where more than one outcome is legitimate, test each separately and force it with settings rather than accepting an intermittent failure — see the two milestone tests in `src/agents/distress.test.js`
- **Lazy-require the logger in modules `windowManager.js` pulls in.** Its tests mock the logger; constructing one at module load reaches the mock before the test initializes it, and the failure surfaces as a temporal dead zone error far from the cause

### Debugging IPC Issues

1. Check `app/preload.js` - Is channel whitelisted in both `send`/`invoke` validChannels AND `receive`?
2. Check `src/windowManager.js` and `src/ipc/` - Is there a matching `ipcMain.on()` or `ipcMain.handle()`? Feature clusters such as the exchange register from `src/ipc/`, not from `windowManager.js`
3. Check renderer - Using correct API? `window.api.send()` (fire-and-forget) vs `window.api.invoke()` (returns Promise)
   - For `window.api.invoke()` calls, always wrap in `try/catch` and surface failures to users via an `addMessage('message:...')` call using an existing error message key where one fits the failure (for example `save_load.load_dialog_error` for save/load failures). No generic `error.*` namespace exists in `game_messages.json` yet — if no existing key fits, add one following the "No hardcoded UI strings" convention below rather than hardcoding text. Do not silently swallow IPC errors.

### Game State Management

- **Critical**: `currentGame` in `main.js` is the single source of truth
- Flow: Universe created → Player created → `currentGame = new Game(universe, settings)` → `initializeGame(playerData)`
- State access: `currentGame.getCurrentLocationState()`, `currentGame.getPlayerState()`
- Save/load: `main.js` handles file I/O, serializes game state to JSON in `saves/` directory
- If save file reading fails or JSON parsing fails during `loadGame()`, do not set `currentGame`; send a dedicated IPC error event (for example `load-game-error`) and have the renderer display an error via an existing save/load failure message key in `game_messages.json`.
- **Economy and exchange state belongs to `EconomyState` and serializes under the save file's `economy` key.** Do not add new top-level save fields for it: `getSaveData()` serializes live instances, but the deserializers copy hand-maintained field lists, so a new top-level field is written and silently not restored — saves look fine and loads are quietly lossy. `EconomyState` has a real `fromJSON`, so anything it owns round-trips. Reached via `currentGame.getEconomy()`

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
  - Files over **1000 lines**: before making changes, check whether the file can be split into focused modules; if splitting is safe and in scope, do it.
  - Files over **2000 lines**: split into smaller modules in the same PR unless the files is a configuration JSON file.

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

### Code Modification Expectations

When modifying code:

1. Create a new branch for the work.
2. Run existing tests first: `npm test`
3. Add tests for new functionality (colocate in same directory).
4. Create the new functionality.
5. Mock external dependencies (universe, settings) and use helper functions to create test data rather than relying on full game initialization
6. Create reusable test helpers when possible. Extract common mock setup into helper functions (see `createTestPlayerData()`) rather than duplicating across test files
7. Test both success and error paths
8. Verify tests pass after changes
9. Commit changes.

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
8. **Don't add top-level save fields for economy state** - It belongs to `EconomyState` under the save file's `economy` key; a new top-level field is written and silently not restored
9. **Don't subscribe another listener to `'tick'` for recurring economy work** - Add it to `src/economy/economyTicker.js`, where the order is inspectable in one place

### Code Quality Violations

See also Code Style Section above.

1. **Don't use synchronous file operations in renderer** - Always async, and prefer IPC calls to main process
2. **Don't duplicate test setup** - Create reusable helper functions for common mocks
3. **Don't forget error handling** - Always wrap async operations, especially template loading and IPC calls
4. **Never Reimplement shared helper logic** - Use canonical helpers (`window.gameHelpers`) instead of local duplicates in multiple renderer modules
5. **Never use `Math.random()` in `src/economy/`, `src/exchange/` or `src/agents/`** - Draw from a named stream via `src/economy/rng.js`
6. **Never call `ledger.post()` directly** - Go through `src/economy/transactions.js` so the journal and the inventory cost basis cannot drift apart
7. **Never move money without a counterparty** - Both legs name a holder, or the money conservation invariant breaks
8. **Never let `src/economy/appraisal.js` see a share price** - No exchange import, no price argument

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
- `src/contentCache.js` - Cached, deep-frozen loader for `data/` content files; use instead of `fs.readFileSync` for game content
- `src/economy/economyState.js` - `EconomyState`, the container all economy and exchange state hangs off; reached via `game.getEconomy()`
- `src/economy/economyTicker.js` - The single `'tick'` subscriber driving the whole economy
- `src/economy/ledger.js` / `src/economy/transactions.js` - Double-entry journal and the recorders that are the only supported way to move money or goods
- `src/economy/conservation.js` - `checkConservation()`, the money invariant, and `cashByHolder()` for when it fails
- `src/economy/appraisal.js` - What things are worth; must never see a share price
- `src/economy/rng.js` - Seeded, serializable PRNG; the only permitted randomness in economy, exchange and agent code
- `src/exchange/exchange.js` - Listings, order submission and settlement; short selling is refused
- `src/exchange/auction.js` - Periodic call clearing at the volume-maximizing price
- `src/agents/corporateAI.js` / `src/agents/investorPool.js` - NPC corporations and the investing public
- `src/ipc/exchangeHandlers.js` - Exchange IPC channels, registered from `windowManager.js`
- `app/exchangeModal.js` - Exchange renderer module (its own file, not part of `modalManager.js`)
- `app/gameHelpers.js` - Canonical shared renderer helper module (`loadTemplate()`, `calculateCargoMass()`, `replaceMessageVariables()`) - see `app/CLAUDE.md`
- `jest.config.js` - Test configuration (dual environments)
- `data/default/en-us/game_settings.json` - Game configuration
- `data/default/en-us/game_messages.json` - Localized text templates
