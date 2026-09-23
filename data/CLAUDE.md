All game content data is in this directory. In theory the game could be configured to load data from different subdirectories. The `default` directory is the default game messages, with US English messages in `en-us`. If the game is translated into other languages the default location would be in a new language encoding directory like `es-mx` (Mexican Spanish), `en-gr` (British English), or `jp` (Japanese).

Within that pattern the files are as follows:

- **game_settings.json** - Core config (starting ship, credits, data directory path) and all economy tuning
- **game_messages.json** - Localized text with token replacement (e.g., `{playerName}`, `{systemName}`)
  - Load with: `addMessage('messages:game_start')` (group) or `addMessage('message:navigation.jump_success', { systemName })`
- **ships.json**, **goods.json**, **buildings.json**, **stellarObjects.json** - Game content definitions
- **planet_names.json**, **station_names.json**, **corporation_names.json** - Name pools for world generation and for the NPC corporations created by `src/npc/npcCorporations.js`
- **images/** - Asset files organized by type/class

To support new languages/variants, copy entire `data/default/en-us/` directory and update `data_directory` in game_settings.json.

## Reading content files

Use `loadContent(fileName, dataDirectory)` from `src/contentCache.js`, not `fs.readFileSync`.
Content files never change while the game runs, and per-tick production reads them constantly.
The cache returns parsed, **deep-frozen** JSON — treat anything you get back as read-only and
copy before modifying.

## Economy settings blocks

`game_settings.json` carries the economy's tuning alongside the older gameplay settings. Each
block is read through a `*Config(settings)` helper in its owning module with a `DEFAULT_*`
fallback, **so a block may be absent and older saves keep loading** — add new keys the same way
rather than reading `settings.x.y` directly.

| Block | Read by | Governs |
|---|---|---|
| `time` | `src/economy/clock.js` | `ticks_per_day`, `days_per_quarter`, `quarters_per_year`. Nothing else should hardcode a tick count |
| `production` | `src/economy/production.js` | Extraction rate per productivity point, staff wages, energy cost, food eaten per billion people per day |
| `restock` | `src/economy/restock.js` | How fast a market closes the gap to ideal stock, and the markup/discount it pays the wider galaxy |
| `solvency` | `src/corporation/solvency.js` | The deficit grace window before a loan is forced, and the buffer that loan carries |
| `statements` | `src/economy/statements.js` | `detail_quarters_retained` — how many quarters of journal detail survive before rollup. **This is the main control on save file size** |
| `appraisal` | `src/economy/appraisal.js` | Discount rate, distress spread, liquidation haircut, default probability ceiling |
| `npc_corporations` | `src/npc/npcCorporations.js` | Rivals' starting cash, the cash floors gating building and acquisition, and `agent_mix`, the relative weight of each strategy in `src/npc/agents/`. `count` is a default: the number of rivals is chosen when a universe is created |
| `investors` | `src/npc/investorPool.js` | The investing public's size, capital, savings rate, belief dispersion and position limits |
| `dividends` | `src/corporation/dividends.js` | Whether dividends pay on quarter close |
| `news` | `src/economy/news.js` | How many news items are kept before the oldest fall off |
| `credit` | `src/corporation.js` | The rating ladder: each grade with its leverage band and its annual interest rate, best to worst |
| `opening_endowments` | `src/game.js` | Opening cash for the bank and for each market |
| `loan_term_quarters` | `src/game.js` (`takeCorporationLoan`) | Balloon loan term, which is what turns a loan into a dated public solvency cliff |

`food_per_person` (read by `src/economy/production.js` and `src/economy/appraisal.js`) and
`population_growth_divisor` (read by `src/stellarObject.js`) predate these blocks and are read
directly rather than through a config helper.

## Adding user-facing text

Every string the player sees comes from `game_messages.json`. Add it as a nested entry
(`"exchange": { "order_rejected": "..." }`) and reference it by dot path
(`addMessage('message:exchange.order_rejected', { reason })`). **Never reference a key that does
not exist**, and never hardcode the text instead. Token names in the call must match the
`{placeholders}` in the JSON exactly, or replacement silently leaves the raw token in place.

This applies to template HTML in `app/templates/` and `app/modals/` as well as to JavaScript.
