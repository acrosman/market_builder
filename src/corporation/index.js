const { Corporation } = require('./corporation');
const solvency = require('./solvency');
const dividends = require('./dividends');
const control = require('./control');

/**
 * Everything a corporation is and does.
 *
 * The class holds a company's own state -- assets, cash, loans, rating. The
 * modules beside it hold behaviours that belong to a company rather than to the
 * economy or the exchange: whether it can pay its debts, what it owes its
 * shareholders, and whether someone controls it.
 *
 * Those three lived in `src/economy/` and `src/exchange/` and were reached from
 * there, which put company behaviour a long way from the company. The economy
 * still drives them -- it decides when a quarter closes and when solvency is
 * checked -- but what happens then is defined here.
 */

module.exports = {
  Corporation,
  ...solvency,
  ...dividends,
  ...control
};
