# src/economy

The simulation that produces the numbers everything else reads: goods get made, wages get paid,
population eats, loans accrue interest, quarters close, companies go broke. Main process only.

Read `src/CLAUDE.md` and the root `CLAUDE.md` alongside this file. `src/exchange/CLAUDE.md`
covers the share market that prices what happens here, and `src/npc/CLAUDE.md` covers the
NPCs that act on it.

## The four invariants

These are the rules that hold this directory together. Breaking one is not a bug in a module,
it is a bug in the economy, and each has tests that exist specifically to catch it.

1. **Money is conserved.** Total cash across every holder equals total credits ever injected.
   Credits enter the game exactly one way -- debited to a holder's `CASH` against that same
   holder's `CONTRIBUTED_CAPITAL` -- and every other transaction moves credits sideways between
   holders. `checkConservation()` in `conservation.js` is the assertion; `injectionsByReason()`
   names which inflow grew when it fails. This invariant has already caught construction
   destroying credits, loan overpayment destroying credits, and restocking billing the wrong
   party. Add a money movement without a counterparty and the conservation test will find it.

2. **The ledger is the truth about cash.** `corporation.cashReserves` is a projection of the
   ledger, refreshed by the ticker, not an independent number. Never adjust it to make a figure
   come out right.

3. **Appraisal cannot see a share price.** See `appraisal.js` below. This is enforced
   structurally, not by discipline.

4. **Use the seeded RNG.** Never `Math.random()` in this directory, `src/exchange/` or
   `src/npc/`. See `rng.js`.

## Posting rule

**Post through `transactions.js`, never through `ledger.post()` directly.** The recorders keep
the journal and the inventory cost basis in step; posting around them lets the two drift, and
the drift shows up later as a wrong gross margin rather than as an error at the call site.

If no recorder fits what you are doing, add one rather than reaching past them.

## Modules

### State and identity

- **economyState.js** -- `EconomyState`, the container for everything in this directory plus the
  exchange and the news store. Owns its own `schemaVersion` and serializes under the save file's
  `economy` key. Reached via `game.getEconomy()`.

  **New economy state hangs off this object rather than becoming a new top-level save field.**
  `Game.getSaveData()` serializes live instances, but the deserializers copy hand-maintained
  field lists, so a new top-level field is written to the save and silently not restored --
  saves look fine and loads are quietly lossy. `EconomyState` has a real `fromJSON`, so
  anything it owns round-trips.

- **accounts.js** -- The chart of accounts (`ACCOUNTS`) and holder identity. A holder is
  `{ kind, id }` flattened to a string by `holderKey()`; `corporationHolder()`,
  `playerHolder()` and `marketHolder()` build the common ones, and `BANK_HOLDER`,
  `EXTERNAL_HOLDER` and `INVESTOR_POOL_HOLDER` are singletons.

  The bank is a real holder, which is what makes a loan draw a transfer rather than money from
  nowhere. Same for the external galaxy in `restock.js`.

- **rng.js** -- `RandomSource` / `RandomStream`. Seeded, serializable PRNG. Streams are named
  (`random.stream('price-noise')`) and independent: a stream's seed is derived by hashing its
  name with the master seed, **so adding a new stream never shifts an existing one's sequence**.
  Mulberry32 keeps its whole state in one 32-bit integer, so a save resumes a sequence exactly
  rather than approximately.

  **Universe generation is deliberately non-deterministic and will stay that way** -- worlds are
  meant to differ between games, and parts of the exchange may become non-deterministic as it
  grows. Reproducibility is a property of an individual seeded stream, not a whole-simulation
  guarantee. Do not write tests that assume two games agree; pin the inputs you care about.

### Books

- **ledger.js** -- The double-entry journal. Every money or goods movement posts with both legs
  named, which is what makes conservation structural rather than hoped for. `audit()` verifies
  the incremental balances against a full journal replay.

  `injectedTotal` is tracked as a running number rather than derived from the journal, because
  `rollupThrough()` rewrites entry shapes and a derived figure breaks at the first rollup.

- **costBasis.js** -- Weighted-average inventory cost per holder per good, so COGS and gross
  margin are real rather than assumed. Selling a position out releases exactly the cost recorded
  against it, leaving no rounding residue.

- **transactions.js** -- The multi-leg recorders: `recordOpeningBalance`, `recordOpeningStock`,
  `recordGoodsTrade`, `recordLoanDraw`, `recordLoanPayment`, `recordConstructionSpend`,
  `recordAssetTransfer`, `recordShareIssue`.

  `recordAssetTransfer` books every transfer at **appraised** value, with any difference between
  consideration and appraisal going to contributed capital and **never to income**. That is what
  stops two companies under common control from manufacturing earnings by selling a world back
  and forth.

- **statements.js** -- Quarterly income statement and balance sheet, derived from the journal
  rather than accumulated alongside it. Only closed quarters publish; a quarter in progress is
  deliberately invisible, because the gap between report dates is the game of investing.
  `compressOldJournal()` rolls detail older than `statements.detail_quarters_retained` quarters
  into opening balances -- balance-preserving, and the main thing keeping the save file bounded.

- **conservation.js** -- The money invariant, described above. `cashByHolder()` is the usual
  first thing to look at when it fails.

### Simulation

- **clock.js** -- Tick/day/quarter/year conversions from the `time` block in
  `game_settings.json`. Nothing in this directory should hardcode a tick count.

- **production.js** -- Per-tick goods extraction, operating costs (wages, energy) and population
  food demand. Extraction is rated off the world's productivity modifiers via
  `EXTRACTION_RATINGS`. The population **buys** its food rather than being fed for free, which
  is what makes a farming world's revenue real.

  Raw extraction only: no building has a working manufacturing recipe yet (issue #32).

- **restock.js** -- Markets drift toward ideal stock by trading with the wider galaxy through
  `EXTERNAL_HOLDER`. This gives prices their mean reversion and stops local economies dead-locking
  at zero stock. Imports are capped by the operator's cash -- without that cap, restocking bills
  world owners into forced loans and bankruptcy.

- **solvency.js** -- The deficit grace window, forced loans and bankruptcy. A corporation that
  goes cash-negative has `solvency.deficit_grace_days` to fix it before a loan is forced on it;
  a corporation whose book net worth reaches zero is bankrupt. `bookNetWorth()` reads the ledger
  directly. What happens to a bankrupt company's worlds, debts and shares is issue #33.

- **appraisal.js** -- What things are *worth*, as distinct from what they cost. Discounted cash
  flows at prevailing goods prices, with output capped by input supply. Also
  `defaultProbability()`, which makes the balloon-maturity cliff priceable, and
  `discountRateFor()`.

  **This module must never see a share price.** It does not import the exchange, it takes no
  price argument, and three tests enforce that. If appraisal could read a share price while the
  market priced companies on appraised value, the two would drive each other and the price
  would be reporting on itself.

  Its absolute level is currently around 2.5x what the simulation actually delivers; see the
  module header and issue #35. Relative ordering between companies is the part to trust.

- **dividends.js** -- Paying shareholders out of a quarter's **earnings**, never out of cash on
  hand. A company that lost money pays nothing however much cash it is sitting on; paying out
  of capital is how a treasury gets drained into shareholders' pockets while the business fails.

- **news.js** -- A bounded ring of what happened, so a player three jumps away can learn a
  company collapsed. **Every item carries the system it happened in.** Nothing reads
  `originSystemId` yet -- knowledge is global and instant -- but making news travel at ship
  speed later is only possible if origin was captured when the items were written.

### The driver

- **economyTickSubscriber.js** -- The single `'tick'` subscriber for the whole economy. Interest accrues
  every tick; everything else runs on day boundaries, in this order:

  1. per world: `runProduction` → `consumeFood` → `restockMarket`
  2. `settleCorporations` -- project ledger cash onto corporations, then enforce solvency
  3. `runAgents` -- investors, then acquisitions, then corporate building
  4. `clearExchange` -- after the agents have placed orders and after solvency, so a distressed
     company's state is current when its shares clear
  5. `reportControlChanges`
  6. `closeBooks` -- publish closed quarters, then pay dividends from the published figures

  The order is load bearing and commented at the call site. **Add new daily work here rather
  than subscribing another listener to `'tick'`**, so the sequence stays inspectable in one
  place.

  Events emitted for the renderer and for news: `corporation-forced-loan`, `corporation-bankrupt`,
  `corporation-built`, `acquisition-bid`, `exchange-cleared`, `control-changed`,
  `statement-published`, `dividend-paid`.

## Settings

Tuning lives in `data/default/en-us/game_settings.json` under `time`, `production`, `restock`,
`solvency`, `statements`, `appraisal`, `dividends` and `loan_term_quarters`. Each module exposes
a `*Config(settings)` reader with a `DEFAULT_*` fallback, so a missing block degrades rather than
throws and old saves keep loading.

## Testing notes

- `economyIntegration.test.js` covers the ledger's round trip through individual money movements:
  opening balances, trades, loans, construction, and save/load. `economyTickSubscriber.test.js` asserts
  `checkConservation()` over long tick runs, as do `src/npc/npcCorporations.test.js` and
  `distress.test.js`. When one breaks, read `cashByHolder()` before reading the diff.
- Mock the universe and settings and build fixtures with helpers rather than standing up a full
  game; see `createTestPlayerData()` in `src/game.test.js` for the pattern.
- Tests that need a repeatable sequence must seed a stream explicitly. Do not rely on two games
  built from the same settings agreeing -- universe generation is not seeded.
