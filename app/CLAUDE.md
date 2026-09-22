All interface code lives in this directory tree.

- **index.html** - Main menu
- **new_game.html/js** - Universe creation (parameters) → player_creation flow
- **player_creation.html/js** - Character creation form → initializes game
- **game.html/js** - Main gameplay interface
  - Location display with dynamic images
  - Ship status panel
  - Action buttons (context-sensitive: jump/dock/land/takeoff)
  - Console for messages (uses template system)
  - Modals: player status, corporation status, company management, buildings, trade, jump planner, universe map, exchange
- **modalManager.js** - Registers and drives most modals; `app/exchangeModal.js` is the exception (see below)
- **gameHelpers.js** - Canonical shared helpers; add cross-module utility logic here rather than duplicating it
- **images** - This is for universal game images, like the logo. These images cannot be overridden by the data directory content.

## Shared patterns

- Load HTML templates from `app/templates/` or `app/modals/` via shared helpers (`window.gameHelpers.loadTemplate()` in renderer modules)
- Use available shared helpers in `app/gameHelpers.js`: `loadTemplate(templatePath)`, `calculateCargoMass(cargo, goodsData)`, `replaceMessageVariables(message, vars)`
- For new cross-module utility logic, add it to `app/gameHelpers.js` and export it via `window.gameHelpers` instead of duplicating per file
- See Code Style: No HTML in JS rule
- CSS files in `app/css/` (one per page + shared)
- **Modal pattern**: Fetch from `app/modals/`, create overlay div, append modal content, add close handlers
- **Data directory pattern**: Thread `dataDir` parameter through constructors (defaults to `data/default/en-us`), use `path.join(__dirname, '..', dataDir, 'file.json')` for file access
- **IPC error handling**: Wrap every `window.api.invoke()` in `try`/`catch` and surface the failure with `addMessage('message:...')` using a key that exists in `game_messages.json`. Never swallow an IPC error silently — from the renderer, a channel missing from `preload.js` looks exactly like a handler that did nothing
- **Validation happens twice**: in the renderer for the player's benefit, and again in the main process for the game's. The renderer is untrusted by design; `contextIsolation` is the security boundary

### Template Loading Pattern

When building dynamic UI content, **always** use HTML templates:

1. **Create template file**: Place in `app/templates/` or `app/modals/`
2. **Load template**: `const template = await window.gameHelpers.loadTemplate('./templates/file.html')`
3. **Insert into DOM**: `container.innerHTML = template` or create wrapper div
4. **Populate data**: Use `querySelector()` and `textContent` to fill in dynamic values

**Example**:

```javascript
// Load template
const itemTemplate = await window.gameHelpers.loadTemplate('./templates/item.html');
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

## Company Management modal tabs

`app/modals/company-management.html` holds a tablist. When adding a tab, update the tab-name
list in `setActiveTab()` in `app/modalManager.js` and the label mappings alongside it; tab
captions resolve from `company_management.tabs.*`.

The **Reports** tab shows published quarterly statements. It loads lazily through
`activateTab()` when the tab is opened rather than on every company state refresh, because a
company's statement history only changes when a quarter closes. Rows are built from
`app/templates/statement-line.html`. Costs render as negatives so the income column reads as an
arithmetic sum down to net income rather than as unsigned magnitudes.

Note for tests: the modal test fixture mocks `global.fetch` for template loading and must
dispatch on the requested path. Serving the modal markup for every fetch leaves row renderers
with no elements to populate.

## Exchange modal

`app/exchangeModal.js` is its own renderer module rather than part of `modalManager.js`, which
already carries every other modal and is past the size at which this project splits files. It
registers `window.exchangeModal` and is initialized from `app/game.js` alongside
`modalManager.init()`, borrowing `modalManager.loadModal` rather than duplicating it.

It holds the only time-series chart in the project. The existing d3 usage is force-directed
maps, so there was no axis or scale idiom to follow; it uses the d3 already loaded under the
page's CSP nonce and the same clear-and-redraw approach. A listing whose price has never moved
would collapse the y domain to a point, so a flat series is padded.

A blank limit-price field means a market order, not a limit of zero. That distinction is load
bearing on both sides of the IPC boundary.

Its markup is `app/modals/exchange.html` with rows built from `app/templates/exchange-listing-row.html`,
`exchange-depth-row.html` and `exchange-order-row.html`. The main-process side is
`src/ipc/exchangeHandlers.js`, not `src/windowManager.js` — see `src/ipc/CLAUDE.md`. Its channels
(`get-exchange-listings`, `get-exchange-listing`, `get-exchange-portfolio`, `submit-share-order`,
`cancel-share-order`, `list-corporation`, `get-cap-table`) are whitelisted in `app/preload.js`
like any other.

Orders can be placed personally or on behalf of a corporation, and the payload has to say which.
The main process defaults to the player when it cannot tell, because that spends the requester's
own credits rather than a company's — so an omitted field fails safe but silently, and the
renderer should send it explicitly.
