# src/agents

The actors the player does not control: the NPC corporations that own worlds and the investing
public that trades their shares. Main process only.

These modules are what turn the economy into a market. Without them the exchange has one
participant and the books have one author. Read `src/economy/CLAUDE.md` and
`src/exchange/CLAUDE.md` first.

## Modules

### corporateAI.js -- the NPC corporations

The 8-20 rival companies (`npc_corporations.count`, currently 12) that own real worlds, produce
real goods and keep real books. Their quarterly statements **summarize what actually happened**
rather than dressing up a stochastic process, which is the whole reason they exist: a company
you can appraise has to have something to appraise.

Policy is deliberately simple -- hold a cash buffer, develop the least developed world you own --
because the worlds themselves differ. One policy applied to twelve different sets of
productivity modifiers already yields divergent results, so complexity in the policy buys less
than it costs.

- `createNpcCorporations()` builds them at game start. **It does not post an opening balance** --
  `Game.recordOpeningBalances()` does that for every corporation including these. Posting in both
  places double-funds them and breaks conservation.
- `runCorporateAI()` is the build cycle, gated on `build_cash_floor` and run every
  `build_check_days`.
- `runAcquisitions()` is the distressed-takeover cycle, gated on `acquisition_cash_floor` and a
  target's `acquisition_distress_threshold`.

  **A buyer persists its `acquisitionTarget` across cycles.** Without that, buyers re-pick a
  target each cycle, spread their bids across several companies and never reach a majority in
  any of them. Bids are priced against the current best ask rather than against appraisal alone,
  so a bid is a real offer into a real book.

  `acquisition_cash_floor` is the practical control on how many companies can afford to join a
  given contest, and so on how often a takeover ends up contested -- see the deadlock note in
  `src/exchange/CLAUDE.md`.

- `corporateCreditSupport()` is the financing path; it goes through the ledger like everything
  else.

### investorPool.js -- the investing public

Modelled as **several distinct investors rather than one** (`investors.investor_count`,
currently 8). That is not cosmetic. A single holder cannot trade with itself, so a one-holder
pool can only ever be on one side of the market and the book never crosses -- an earlier
single-holder version produced zero trades across a full simulated year.

- **Capital is finite and tracked in the ledger**, so the public can run out of money and a
  market can genuinely lose its bid. `accrueSavings()` is the only inflow, at
  `investors.savings_per_day`.
- **Beliefs come from appraisal**, which cannot see a share price, so price cannot feed on
  itself. `belief_dispersion` spreads the investors' fair values apart so they disagree, which
  is what makes a book rather than a queue.
- Investors **withdraw from the bid** as a company's default probability climbs, and refuse to
  bid at all once it appraises at nothing -- **while still offering their holdings**. Everyone
  wanting out and nobody buying is the shape of a failing company and has to be visible in the
  book.

  Note the asymmetry in `ordersForListing()`: a distressed company falls back to `lastPrice` for
  **asks only**. An early return on `fair <= 0` kills the sellers too and freezes the book,
  which is the opposite of what a collapse should look like.
- `subscribeToIssue()` is how a share issue reaches the public.

## Conventions

- **Seeded RNG only.** Every agent decision that varies must draw from a named stream via
  `src/economy/rng.js`. `Math.random()` here makes saves unreproducible.
- **Post through `src/economy/transactions.js`.** Agents move real money; they are subject to
  the conservation invariant like everything else.
- **Config lives in `game_settings.json`** under `npc_corporations` and `investors`, read
  through `npcCorporationConfig()` / `investorConfig()` with `DEFAULT_*` fallbacks. Company names
  come from `data/default/en-us/corporation_names.json`.
- Agents are driven from `EconomyTickSubscriber.runAgents()` -- investors, then acquisitions, then
  building -- not from their own tick subscriptions.

## Testing notes

`distress.test.js` asserts on emergent outcomes -- what a whole simulated year produces -- rather
than on a function's return value, which makes it the most failure-prone file here. Two lessons
already paid for:

- **Split contested and uncontested outcomes into separate tests.** The original single test
  assumed a takeover completes, and failed roughly one run in six when three corporations split
  the float with nobody above half. Both paths are legitimate; test them separately and force
  the uncontested case by raising `acquisition_cash_floor` so only one buyer qualifies.
- **Pin the inputs you assert on.** These tests build a universe, which is not seeded. Assert on
  invariants (conservation holds, price below asset value, bid side empty) and on explicitly
  pinned values, never on figures that happen to fall out of world generation.

`agents.test.js` covers the per-function behavior; keep unit assertions there and emergent ones
in `distress.test.js`.
