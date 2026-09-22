# src/exchange

The share market. Order books, periodic clearing, holdings, and who ends up controlling a
company. Main process only.

Read `src/economy/CLAUDE.md` first -- the exchange prices what the economy produces, and the
appraisal firewall described there is what keeps prices from feeding on themselves.

## Design decisions to know before changing anything

**Clearing is a periodic call auction, not a continuous limit order book and not a price-impact
formula.** One clearing price per market cycle, chosen to maximize executed volume against the
resting orders. This suits the engine's clock: time advances in chunks (a jump costs 1-20
ticks), and a call market clears in chunks, so twenty ticks is twenty clears with no fiction
about what happened in between. Depth comes from real resting orders rather than a tuning
constant, which is why cornering a thin float works -- you genuinely bought the offers -- and
why **"no bid" is a state the market can reach**, which is what makes a solvency cliff bite.

**Short selling is refused**, including selling the same shares twice across two orders. It
needs borrow, margin and a forced cover to exist first, and none of those do.

**Instrument kind is a seam, not decoration.** `instruments.js` exists so commodity instruments
(futures on goods) can be listed alongside equity without reworking the book, the auction or the
holdings register. Settlement branches on instrument kind, so a new tradeable is a new branch
rather than an edit to the equity path. Expiry, delivery, margin and mark-to-market are
deliberately absent -- add them with the instrument that needs them.

**Nothing here may import `src/economy/appraisal.js`'s inputs backwards.** Appraisal must not
learn a share price. The dependency runs exchange → appraisal and never the other way.

## Modules

- **instruments.js** -- What can be listed. `INSTRUMENT_KINDS.EQUITY` only today.
  `symbolFor()` gives a listing its key -- for equity that is the company name.
  `settlesByShareTransfer()` is the branch point settlement uses.

- **auction.js** -- `clearAuction()` picks the volume-maximizing price; ties break toward the
  smaller imbalance and then toward the reference price, so the outcome depends on the book and
  **not on iteration order**. `allocate()` fills orders that are strictly inside the clearing
  price first, then prorates the at-price orders, giving the remainder out by ascending order id
  so the split is reproducible.

- **listing.js** -- One instrument's order book and price history. Orders rest across clears and
  across saves. History is a fixed-length ring (`DEFAULT_HISTORY_LENGTH`, 512) so a long game
  cannot grow it without bound. `pruneClosedOrders(beforeTick)` drops settled and cancelled
  orders; `Exchange.pruneClosedOrders()` calls it each clear with a retention window.

- **portfolio.js** -- Signed positions by holder and symbol, plus `capTable()` and
  `totalHeld()`. Personal, corporate and public holdings share one register, so a cap table can
  mix the player, rival corporations and the investing public without special cases.

- **exchange.js** -- Listings, `submitOrder()`, `clearAll()` and settlement. Rejections are
  named (`REJECTIONS`: `unknown_listing`, `invalid_order`, `insufficient_shares`, `bankrupt`)
  rather than returned as booleans, because the renderer has to tell the player *why*.

  Cash and shares both post to the ledger on settlement -- see the conservation invariant in
  `src/economy/CLAUDE.md`.

- **control.js** -- Who controls a listing, from the cap table and nothing else. More than
  `CONTROL_THRESHOLD` (0.5) is control, whoever holds it -- the player, a rival, or the
  investing public that never wanted the job. `detectControlChanges()` reports a change;
  deciding what a new controller may *do* with the company's worlds and debts is deliberately
  not here, and is tracked in issue #33.

  **A contest can leave nobody in control.** Several corporations bidding for the same
  distressed company can split the float three ways with no holder above half. The company then
  stays listed, keeps accruing interest toward a maturity it cannot meet, and fails with its
  stock spread across rivals who each hold a blocking stake and none of whom can act. This is
  reachable in ordinary play -- see the two milestone tests in `src/agents/distress.test.js`,
  one for the contested path and one for an uncontested takeover -- and the follow-up on #33.

## Order semantics

**A missing limit price means a market order, not a limit of zero.** `Number(null)` is `0` and
`0` is finite, so a naive read turns "buy at any price" into "buy at nothing" and the order
never fills. Check for null explicitly. This distinction is load bearing on both sides of the
IPC boundary; see `app/CLAUDE.md`.

## Serialization

Each class carries its own `*_SCHEMA_VERSION` and `toJSON`/`fromJSON`. The exchange serializes
as part of `EconomyState` under the save file's `economy` key -- do not add a top-level save
field for exchange state; see `src/economy/CLAUDE.md` for why that fails silently.

Resting orders and price history are the two things that grow with playtime. Both are bounded
(order pruning, ring buffer). If you add per-clear state, bound it when you add it.

## Testing notes

- `auction.test.js` is where clearing-rule changes get caught. Assert on the chosen price and
  the executed volume, not on which order happened to fill.
- Determinism tests must pin the opening price rather than building two games and comparing.
  Universe generation is not seeded, so two games do not agree about anything.
- Use the seeded RNG from `src/economy/rng.js`, never `Math.random()`.
