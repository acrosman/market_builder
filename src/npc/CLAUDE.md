# src/npc

The actors the player does not control: the rival corporations that own worlds,
and the investing public that trades their shares. Main process only.

These modules are what turn the economy into a market. Without them the exchange has one
participant and the books have one author. Read `src/economy/CLAUDE.md` and
`src/exchange/CLAUDE.md` first.

## Terms

- **NPC** is what the game's non-player actors are called, here and everywhere else.
- **Agent** means something narrower: a *strategy module* in `src/npc/agents/` that decides what
  one NPC corporation does with a turn. An NPC corporation has an agent; it is not one.

## Structure

```
npcCorporations.js   Creating rivals, their config, the credit support they build with,
                     and the coordinator that gives each one a turn
investorPool.js      The investing public
agents/
  agentInterface.js  The contract every strategy implements
  index.js           The registry: name -> agent, and the default
  marketAgent.js     Grow by building and by buying rivals on the exchange
  militaryAgent.js   Take worlds by force (placeholder, see below)
```

## The agent contract

`npcCorporations.js` decides **who** gets a turn. The agent decides **what they do with it**.
That split is the point: a new kind of rival is a new module in `agents/`, not another branch in
a growing decision function.

An agent exports `name`, `descriptionKey` and `act(context)`, and `act()` returns an array of
action records that the caller labels and reports. `agentInterface.js` documents the whole
contract and `isAgent()` validates it at registration, so a malformed agent fails at startup
rather than midway through a simulated year.

Rules that matter:

- **`name` is persisted on the corporation**, so renaming one changes how existing saves load.
  An unknown name falls back to the default rather than throwing, which is what keeps a save
  written before a strategy was removed still loadable.
- **Agents never return user-facing text.** `descriptionKey` is a path into
  `game_messages.json`.
- **An agent that decides to do nothing returns `[]`.** It does not throw and does not report.
- **Which agents a game uses is a setting**, `npc_corporations.agent_mix`, as
  `{ agentName: weight }`. A weight of zero keeps an agent registered but unused.

### marketAgent

The strategy the game shipped with, and the baseline the others are measured against. It
develops worlds it owns and bids for failing rivals at a discount, all through the market and
none of it by force.

Its policy is deliberately plain -- keep a cash buffer, develop the least developed world,
pursue one target at a time -- because the worlds differ enough that one policy already produces
divergent companies.

Two behaviours here were paid for with bugs:

- **A buyer keeps its `acquisitionTarget` across cycles.** Choosing afresh each cycle spread bids
  across every struggling company and never accumulated a majority of any of them. A takeover is
  a campaign against one company, not a standing interest in distress generally.
- **Bids are priced against the current best ask**, not against appraisal alone. A bid nobody can
  hit buys nothing however shrewdly it is priced.

`distressedTargets()` appraises every listing once per cycle and the coordinator shares the
result, rather than every bidder re-appraising the same companies.

### militaryAgent

A placeholder that does nothing. The game has no invasion mechanics -- no fleets that move with
intent, no combat resolution, no rules for what changes hands when a world falls -- so rather
than approximate an outcome the rest of the game could not show or contest, it takes no action.

It exists now so the shape of the decision was settled while the interface was being designed.
Its module header lists what it will need when invasion lands, including that a seized world
must be booked through `recordAssetTransfer` at appraised value so a conquest cannot manufacture
earnings.

## investorPool.js

The investing public, modelled as **several distinct investors rather than one**
(`investors.investor_count`). That is not cosmetic: a single holder cannot trade with itself, so
a one-holder pool can only ever be on one side of the market and the book never crosses -- an
earlier single-holder version produced zero trades across a full simulated year.

- **Capital is finite and tracked in the ledger**, so the public can run out and a market can
  genuinely lose its bid. `accrueSavings()` is the only inflow.
- **Beliefs come from appraisal**, which cannot see a share price, so price cannot feed on
  itself. `belief_dispersion` spreads their fair values apart so they disagree, which is what
  makes a book rather than a queue.
- Investors **withdraw from the bid** as default probability climbs and refuse to bid once a
  company appraises at nothing, **while still offering their holdings**. Everyone wanting out and
  nobody buying is the shape of a failing company and has to be visible in the book.

  Note the asymmetry in `ordersForListing()`: a distressed company falls back to `lastPrice` for
  **asks only**. An early return on `fair <= 0` kills the sellers too and freezes the book, which
  is the opposite of what a collapse should look like.

## Conventions

- **Seeded RNG only.** Every decision that varies draws from a named stream via
  `src/economy/rng.js`. `Math.random()` here makes saves unreproducible.
- **Post through `src/economy/transactions.js`.** NPCs move real money and are subject to the
  conservation invariant like everything else.
- **Config lives in `game_settings.json`** under `npc_corporations` and `investors`. Company
  names come from `data/default/en-us/corporation_names.json`.
- NPCs are driven from `EconomyTickSubscriber.runAgents()`, not from their own tick
  subscriptions.

## Known imbalance

NPC corporations develop their worlds as fast as cash and ticks allow, while the player has to
fly between systems and move goods by hand. Nothing yet makes a rival travel, scout or run a
trade route, so their growth is not paced by anything the player is paced by. Tracked
separately; do not quietly compensate for it by weakening the agents.

## Testing notes

`distress.test.js` asserts on emergent outcomes -- what a whole simulated year produces -- rather
than on a function's return value, which makes it the most failure-prone file here. Two lessons
already paid for:

- **Split contested and uncontested outcomes into separate tests.** The original single test
  assumed a takeover completes, and failed roughly one run in six when three corporations split
  the float with nobody above half. Both paths are legitimate; force the uncontested case by
  raising `acquisition_cash_floor` so only one buyer qualifies.
- **Pin the inputs you assert on.** These tests build a universe, which is not seeded. Assert on
  invariants (`ledger.audit().cashMatches`, price below asset value, bid side empty) and on
  explicitly pinned values, never on figures that fall out of world generation.

`npcCorporations.test.js` covers creation, config and the coordinator; `agents/agents.test.js`
covers the contract and the registry. Keep unit assertions there and emergent ones in
`distress.test.js`.
