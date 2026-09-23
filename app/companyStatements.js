(function () {
  // Context references set during init()
  let _api;
  let _addMessage;
  let _resolveMessageText;

  /**
   * Renders a company's published quarterly reports.
   *
   * Split out of `app/modalManager.js`, which carries every other modal and is
   * past the size at which this project splits files. Statement rendering is
   * self-contained -- it reads one IPC channel and fills one tab -- so it is
   * the part of the company management modal that separates most cleanly.
   *
   * Costs render as negatives so the income column reads as an arithmetic sum
   * down to net income rather than as a set of unsigned magnitudes.
   */

  /**
   * Initialize with the renderer context this module needs.
   * @param {Object} context - Shared game context.
   * @param {Object} context.api - window.api IPC bridge.
   * @param {Function} context.addMessage - Display a message in the console.
   * @param {Function} context.resolveMessageText - Resolve a localized message string.
   * @returns {void}
   * @example
   * window.companyStatements.init({ api: window.api, addMessage, resolveMessageText });
   */
  function init(context) {
    _api = context.api;
    _addMessage = context.addMessage;
    _resolveMessageText = context.resolveMessageText;
  }

  /**
   * Render one labelled figure into a statement section.
   * @param {HTMLElement} container - Element to append the line to.
   * @param {string} template - Loaded statement-line template markup.
   * @param {string} labelKey - Message key for the line label.
   * @param {number} value - Figure to display.
   * @param {Object} [options={}] - `{ negate }` to show a cost as negative.
   * @returns {Promise<void>} Resolves once the line is appended.
   * @example
   * await appendStatementLine(lines, template, 'x.revenue', 4200);
   */
  async function appendStatementLine(container, template, labelKey, value, options = {}) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = template;
    const line = wrapper.firstElementChild;
    if (!line) {
      return;
    }

    const amount = options.negate ? -Math.abs(Number(value) || 0) : (Number(value) || 0);
    line.querySelector('.statement-line-label').textContent =
      await _resolveMessageText(labelKey);
    line.querySelector('.statement-line-value').textContent = amount.toLocaleString();
    container.appendChild(line);
  }

  /**
   * Render one published quarterly statement into the reports tab.
   * @param {Object} statement - Statement from the economy.
   * @returns {Promise<void>} Resolves once rendered.
   * @example
   * await renderStatement(statements[statements.length - 1]);
   */
  async function renderStatement(statement) {
    const incomeLines = document.getElementById('company-report-income-lines');
    const balanceLines = document.getElementById('company-report-balance-lines');
    const period = document.getElementById('company-report-period');
    if (!incomeLines || !balanceLines) {
      return;
    }

    incomeLines.textContent = '';
    balanceLines.textContent = '';

    const template = await window.gameHelpers.loadTemplate('./templates/statement-line.html');

    if (period) {
      period.textContent = await _resolveMessageText(
        'company_management.reports.period',
        {
          fromTick: statement.fromTick.toLocaleString(),
          toTick: statement.toTick.toLocaleString()
        }
      );
    }

    const prefix = 'company_management.reports.';
    const income = statement.income;
    await appendStatementLine(incomeLines, template, `${prefix}revenue`, income.revenue);
    await appendStatementLine(incomeLines, template, `${prefix}cogs`, income.cogs, { negate: true });
    await appendStatementLine(incomeLines, template, `${prefix}gross_profit`, income.grossProfit);
    await appendStatementLine(incomeLines, template, `${prefix}operating_expense`, income.operatingExpense, { negate: true });
    await appendStatementLine(incomeLines, template, `${prefix}interest_expense`, income.interestExpense, { negate: true });
    await appendStatementLine(incomeLines, template, `${prefix}net_income`, income.netIncome);

    const balance = statement.balance;
    await appendStatementLine(balanceLines, template, `${prefix}cash`, balance.assets.cash || 0);
    await appendStatementLine(balanceLines, template, `${prefix}inventory`, balance.assets.inventory || 0);
    await appendStatementLine(balanceLines, template, `${prefix}property`, balance.assets.property || 0);
    await appendStatementLine(balanceLines, template, `${prefix}investments`, balance.assets.investments || 0);
    await appendStatementLine(balanceLines, template, `${prefix}loan_receivable`, balance.assets.loan_receivable || 0);
    await appendStatementLine(balanceLines, template, `${prefix}total_assets`, balance.totalAssets);
    await appendStatementLine(balanceLines, template, `${prefix}debt`, balance.totalLiabilities, { negate: true });
    await appendStatementLine(balanceLines, template, `${prefix}net_worth`, balance.netWorth);
    await appendStatementLine(balanceLines, template, `${prefix}shares_issued`, statement.sharesIssued);
  }

  /**
   * Load and display the published quarterly reports for a company.
   *
   * Only closed quarters exist, so a new game shows an empty-state message
   * until the first quarter ends rather than an incomplete report.
   * @param {string} companyName - Company whose reports to show.
   * @returns {Promise<void>} Resolves once the tab is populated.
   * @example
   * await window.companyStatements.refresh('Trade Guild');
   */
  async function refresh(companyName) {
    const emptyMessage = document.getElementById('company-reports-empty');
    const bankruptMessage = document.getElementById('company-reports-bankrupt');
    const body = document.getElementById('company-reports-body');
    const select = document.getElementById('company-report-quarter-select');
    if (!emptyMessage || !body || !select) {
      return;
    }

    let statements = [];
    try {
      const result = await _api.invoke('get-company-statements', { companyName });
      statements = Array.isArray(result?.statements) ? result.statements : [];
    } catch (error) {
      window.gameHelpers.logClientError('Failed to load company statements', error);
      _addMessage('message:company_management.reports.load_error');
      return;
    }

    if (statements.length === 0) {
      emptyMessage.classList.remove('hidden');
      body.classList.add('hidden');
      bankruptMessage.classList.add('hidden');
      return;
    }

    emptyMessage.classList.add('hidden');
    body.classList.remove('hidden');

    const latest = statements[statements.length - 1];
    if (latest.isBankrupt) {
      bankruptMessage.classList.remove('hidden');
    } else {
      bankruptMessage.classList.add('hidden');
    }

    // Newest first: the most recent report is the one that matters
    const ordered = [...statements].reverse();
    select.textContent = '';
    for (const statement of ordered) {
      const option = document.createElement('option');
      option.value = String(statement.quarterIndex);
      option.textContent = await _resolveMessageText(
        'company_management.reports.quarter_option',
        { quarterIndex: statement.quarterIndex }
      );
      select.appendChild(option);
    }

    select.onchange = async () => {
      const chosen = statements.find(
        statement => String(statement.quarterIndex) === select.value
      );
      if (chosen) {
        await renderStatement(chosen);
      }
    };

    await renderStatement(ordered[0]);
  }

  const api = {
    init,
    refresh,
    renderStatement,
    appendStatementLine
  };

  if (typeof window !== 'undefined') {
    window.companyStatements = api;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
