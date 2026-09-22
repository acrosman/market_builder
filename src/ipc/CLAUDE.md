# src/ipc

Main-process IPC handler registration, split by feature. Main process only.

`src/windowManager.js` still owns most of the game's channels and is the place to look first
when debugging IPC. This directory is where a **cluster of related channels** moves when it is
large enough to stand on its own -- windowManager already registers every other channel in the
game and is close to the size at which this project splits modules.

## The three-place rule still applies

Adding a channel means touching three files, wherever the handler lives:

1. `app/preload.js` -- add it to the right `validChannels` array (`send`, `invoke`, or
   `receive`; a channel used with `invoke` must be in the invoke list)
2. the handler -- `ipcMain.handle()` for `invoke`, `ipcMain.on()` for `send`, here or in
   `src/windowManager.js`
3. the renderer module that calls it, with the call wrapped in `try`/`catch` and failures
   surfaced through `addMessage('message:...')` using a key that exists in `game_messages.json`

A channel missing from `preload.js` fails silently from the renderer's point of view, which is
the usual cause of "the handler never runs".

## Registration pattern

Each module exports a `register*Handlers({ ipcMain, getCurrentGame })` function that
`windowManager.js` calls during setup. **Take the game through a getter, not as a value.**
`currentGame` is replaced wholesale on new-game and load, so a captured reference goes stale and
the handlers quietly operate on a dead game.

```javascript
// src/windowManager.js
registerExchangeHandlers({ ipcMain, getCurrentGame });
```

## Lazy requires

**Build the logger inside the function, not at module load.** `windowManager.js` requires these
modules at the top of the file and its tests mock the logger; constructing a logger at load time
reaches the mock before the test has initialized it, and the failure surfaces as a temporal dead
zone error a long way from the cause. This has bitten twice. The same caution applies to any
module that pulls in the logger transitively -- `src/economy/appraisal.js` among them.

## Modules

- **exchangeHandlers.js** -- the share exchange's seven channels:
  `get-exchange-listings`, `get-exchange-listing`, `get-exchange-portfolio`,
  `submit-share-order`, `cancel-share-order`, `list-corporation`, `get-cap-table`.

  - `resolveHolder(game, payload)` decides whether a request is acting personally or as a
    corporation. The player trades with their own credits; corporations trade from their
    treasuries, so a request has to say which. **Defaulting to the player is the safe reading** --
    it spends the requester's own money rather than a company's.
  - `buildListingView(...)` shapes a listing for the renderer. Keep view-shaping here rather
    than in the renderer, so the renderer never needs to understand the book's internals.
  - A blank limit price is a **market order, not a limit of zero**. Validate that explicitly on
    this side of the boundary as well as in the renderer; see `src/exchange/CLAUDE.md`.

## Validation

Validate in the renderer for the player's benefit and **again here for the game's**. The
renderer is untrusted by design -- `contextIsolation` is the security boundary, not a
suggestion -- so a handler that trusts its payload is the hole. Reject with a named reason the
renderer can turn into a message rather than with a bare `false`.
