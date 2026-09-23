# src/corporation

Everything a company **is** and **does**. Main process only.

The class holds a company's own state -- worlds, ships, cash, loans, credit rating. The modules
beside it hold behaviours that belong to a company rather than to the economy or the market it
operates in: whether it can pay its debts, what it owes its shareholders, and whether anybody
controls it.

Those three used to live under `src/economy/` and `src/exchange/`, which put company behaviour a
long way from the company. The economy still *drives* them -- it decides when a quarter closes
and when solvency is checked -- but what happens then is defined here.

## Modules

- **corporation.js** -- the `Corporation` class.

  - **`calculateTotalValue()` is net of debt; `calculateTotalAssetValue()` is gross.** Borrowing
    must not raise reported value, and net worth may legitimately be negative.
  - **`cashReserves` is a projection of the ledger**, set through `setCashPosition()`, and may be
    negative. The ledger is the source of truth; never adjust this to make a figure look right.
  - **`getCreditRating()` ladders on leverage, not the size of the debt.** A small loan with
    nothing behind it is worse credit than a large one against valuable worlds. Grades are school
    grades, A+ to F, and both the leverage bands and the interest rate at each grade come from
    the `credit` block in `game_settings.json` -- one table, so a grade cannot exist without a
    rate behind it. **F means failure**, not a bad ratio: bankrupt, debt against no assets, or a
    loan left past maturity unpaid.
  - **`agentName`** records which strategy in `src/npc/agents/` drives this company, or null for
    the player's. It persists through a save.

- **solvency.js** -- the deficit grace window, forced loans and bankruptcy. `bookNetWorth()`
  reads the ledger directly.

  The death spiral is the mechanic, not a bug in it: each forced loan adds debt, the debt accrues
  interest, the interest deepens the deficit, and when net worth reaches zero the company is
  bankrupt. What then happens to its worlds, goods, shares and debts is deliberately out of scope
  and tracked separately.

- **dividends.js** -- what a company owes its shareholders, paid out of a quarter's **earnings**
  and never out of cash on hand. A company that lost money pays nothing however much cash it is
  sitting on; paying out of capital is how a treasury gets drained into shareholders' pockets
  while the business fails.

  `payQuarterlyDividends()` is the economy's entry point, called when a quarter closes.
  `dividendDue()` and `payDividend()` are the company's own behaviour.

- **control.js** -- what counts as control, and whether a given holder has it.

  The exchange works out *who holds what* -- that is what a cap table is, and
  `src/exchange/control.js` reads it. Whether a holding **amounts to control** is a fact about
  companies, so it is decided here. A simple majority is control, whoever holds it: the player, a
  rival, or the investing public that never wanted the job.

- **index.js** -- re-exports the class and the behaviours, so `require('../corporation')` gets the
  whole domain.

## Conventions

- **Money moves through `src/economy/transactions.js`**, never through `ledger.post()` directly,
  and never without a counterparty. The conservation invariant applies here like everywhere else.
- **No user-facing strings.** Anything the player reads comes from `game_messages.json`.
- **Tunable numbers are settings**, under `credit`, `solvency`, `dividends`,
  `loan_term_quarters`. Read them through the helpers in `src/settings.js` rather than declaring a
  local default, so there is one place a default is written down.
- **Nothing here may reach a share price.** The credit rating uses book value deliberately: a
  lender assessing collateral cares what it could recover, not what the borrower hopes to earn,
  and keeping it on book value also keeps the rating free of any dependency that could reach the
  exchange.

## Known rough edges

- Loan behaviour lives on `Corporation` -- origination, interest accrual, repayment, maturity --
  which makes the borrower responsible for the terms of its own credit. A bank service owning
  loans centrally is the likelier long-term shape; tracked separately.
