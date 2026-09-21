const { Ledger, ENTRY_KINDS } = require('./ledger');
const {
  ACCOUNTS,
  BANK_HOLDER,
  corporationHolder,
  playerHolder,
  holderKey
} = require('./accounts');

const ACME = corporationHolder('Acme Orbital');
const RIVAL = corporationHolder('Rival Freight');
const PLAYER = playerHolder('TestPlayer');

/**
 * Build a valid entry with overridable fields.
 * @param {Object} [overrides={}] - Fields to override.
 * @returns {Object} A postable entry.
 */
function entry(overrides = {}) {
  return {
    tick: 1,
    amount: 100,
    debit: { holder: ACME, account: ACCOUNTS.INVENTORY },
    credit: { holder: ACME, account: ACCOUNTS.CASH },
    kind: ENTRY_KINDS.GOODS_PURCHASE,
    ...overrides
  };
}

describe('Ledger', () => {
  describe('post validation', () => {
    test('should reject a non-object entry', () => {
      const ledger = new Ledger();
      expect(() => ledger.post(null)).toThrow(TypeError);
      expect(() => ledger.post('nope')).toThrow(TypeError);
    });

    test('should reject non-integer or non-positive amounts', () => {
      const ledger = new Ledger();
      expect(() => ledger.post(entry({ amount: 10.5 }))).toThrow(/positive integer/);
      expect(() => ledger.post(entry({ amount: 0 }))).toThrow(/positive integer/);
      expect(() => ledger.post(entry({ amount: -5 }))).toThrow(/positive integer/);
      expect(() => ledger.post(entry({ amount: NaN }))).toThrow(/positive integer/);
    });

    test('should reject a bad tick', () => {
      const ledger = new Ledger();
      expect(() => ledger.post(entry({ tick: -1 }))).toThrow(/non-negative integer/);
      expect(() => ledger.post(entry({ tick: 1.5 }))).toThrow(/non-negative integer/);
    });

    test('should reject a missing leg', () => {
      const ledger = new Ledger();
      expect(() => ledger.post(entry({ debit: undefined }))).toThrow(/debit and a credit/);
      expect(() => ledger.post(entry({ credit: undefined }))).toThrow(/debit and a credit/);
    });

    test('should reject an unknown account', () => {
      const ledger = new Ledger();
      expect(() => ledger.post(entry({
        debit: { holder: ACME, account: 'imaginary' }
      }))).toThrow(/unknown debit account/);
      expect(() => ledger.post(entry({
        credit: { holder: ACME, account: 'imaginary' }
      }))).toThrow(/unknown credit account/);
    });

    test('should reject a malformed holder', () => {
      const ledger = new Ledger();
      expect(() => ledger.post(entry({
        debit: { holder: { kind: 'corporation' }, account: ACCOUNTS.CASH }
      }))).toThrow(/non-empty kind and id/);
    });

    test('should reject an entry whose legs are identical', () => {
      const ledger = new Ledger();
      expect(() => ledger.post(entry({
        debit: { holder: ACME, account: ACCOUNTS.CASH },
        credit: { holder: ACME, account: ACCOUNTS.CASH }
      }))).toThrow(/must differ/);
    });

    test('should allow the same account across different holders', () => {
      const ledger = new Ledger();
      expect(() => ledger.post(entry({
        debit: { holder: ACME, account: ACCOUNTS.CASH },
        credit: { holder: RIVAL, account: ACCOUNTS.CASH }
      }))).not.toThrow();
    });
  });

  describe('post', () => {
    test('should assign increasing ids', () => {
      const ledger = new Ledger();
      expect(ledger.post(entry()).id).toBe(1);
      expect(ledger.post(entry()).id).toBe(2);
    });

    test('should default the kind when omitted', () => {
      const ledger = new Ledger();
      expect(ledger.post(entry({ kind: undefined })).kind).toBe('unspecified');
    });

    test('should copy refs rather than aliasing them', () => {
      const ledger = new Ledger();
      const refs = { goodName: 'metal' };
      const posted = ledger.post(entry({ refs }));

      refs.goodName = 'mutated';
      expect(posted.refs.goodName).toBe('metal');
    });

    test('should move an asset between holders without changing the total', () => {
      const ledger = new Ledger();
      ledger.post(entry({
        amount: 500,
        debit: { holder: ACME, account: ACCOUNTS.CASH },
        credit: { holder: RIVAL, account: ACCOUNTS.CASH }
      }));

      expect(ledger.balance(ACME, ACCOUNTS.CASH)).toBe(500);
      expect(ledger.balance(RIVAL, ACCOUNTS.CASH)).toBe(-500);
      expect(ledger.totalAcrossHolders(ACCOUNTS.CASH)).toBe(0);
    });
  });

  describe('balance direction by account type', () => {
    test('should increase an asset on the debit side', () => {
      const ledger = new Ledger();
      ledger.post(entry({
        amount: 300,
        debit: { holder: ACME, account: ACCOUNTS.INVENTORY },
        credit: { holder: ACME, account: ACCOUNTS.CASH }
      }));

      expect(ledger.balance(ACME, ACCOUNTS.INVENTORY)).toBe(300);
      expect(ledger.balance(ACME, ACCOUNTS.CASH)).toBe(-300);
    });

    test('should increase a liability on the credit side', () => {
      const ledger = new Ledger();
      ledger.post(entry({
        amount: 50000,
        debit: { holder: ACME, account: ACCOUNTS.CASH },
        credit: { holder: ACME, account: ACCOUNTS.DEBT }
      }));

      expect(ledger.balance(ACME, ACCOUNTS.DEBT)).toBe(50000);
      expect(ledger.balance(ACME, ACCOUNTS.CASH)).toBe(50000);
    });

    test('should increase income on the credit side', () => {
      const ledger = new Ledger();
      ledger.post(entry({
        amount: 1800,
        debit: { holder: ACME, account: ACCOUNTS.CASH },
        credit: { holder: ACME, account: ACCOUNTS.REVENUE }
      }));

      expect(ledger.balance(ACME, ACCOUNTS.REVENUE)).toBe(1800);
    });

    test('should increase an expense on the debit side', () => {
      const ledger = new Ledger();
      ledger.post(entry({
        amount: 1200,
        debit: { holder: ACME, account: ACCOUNTS.COGS },
        credit: { holder: ACME, account: ACCOUNTS.INVENTORY }
      }));

      expect(ledger.balance(ACME, ACCOUNTS.COGS)).toBe(1200);
      expect(ledger.balance(ACME, ACCOUNTS.INVENTORY)).toBe(-1200);
    });
  });

  describe('postMany', () => {
    test('should require an array', () => {
      const ledger = new Ledger();
      expect(() => ledger.postMany('nope')).toThrow(/array of entries/);
    });

    test('should record every entry in order', () => {
      const ledger = new Ledger();
      const posted = ledger.postMany([entry(), entry(), entry()]);

      expect(posted.map(e => e.id)).toEqual([1, 2, 3]);
      expect(ledger.entries).toHaveLength(3);
    });

    test('should record nothing when any entry is invalid', () => {
      const ledger = new Ledger();
      ledger.post(entry());

      expect(() => ledger.postMany([
        entry({ amount: 200 }),
        entry({ amount: -1 })
      ])).toThrow(TypeError);

      // The valid first entry of the failed batch must not have been recorded
      expect(ledger.entries).toHaveLength(1);
      expect(ledger.balance(ACME, ACCOUNTS.INVENTORY)).toBe(100);
    });

    test('should record a complete goods sale across two parties', () => {
      const ledger = new Ledger();

      // Seller bought 100 metal at 12 earlier
      ledger.post(entry({
        amount: 1200,
        debit: { holder: ACME, account: ACCOUNTS.INVENTORY },
        credit: { holder: ACME, account: ACCOUNTS.CASH }
      }));

      // Sale of that stock at 18
      ledger.postMany([
        {
          tick: 5,
          amount: 1800,
          debit: { holder: ACME, account: ACCOUNTS.CASH },
          credit: { holder: ACME, account: ACCOUNTS.REVENUE },
          kind: ENTRY_KINDS.GOODS_SALE
        },
        {
          tick: 5,
          amount: 1200,
          debit: { holder: ACME, account: ACCOUNTS.COGS },
          credit: { holder: ACME, account: ACCOUNTS.INVENTORY },
          kind: ENTRY_KINDS.COST_OF_SALE
        },
        {
          tick: 5,
          amount: 1800,
          debit: { holder: RIVAL, account: ACCOUNTS.INVENTORY },
          credit: { holder: RIVAL, account: ACCOUNTS.CASH },
          kind: ENTRY_KINDS.GOODS_PURCHASE
        }
      ]);

      // Gross margin is real: 1800 revenue less 1200 cost
      expect(ledger.balance(ACME, ACCOUNTS.REVENUE)).toBe(1800);
      expect(ledger.balance(ACME, ACCOUNTS.COGS)).toBe(1200);
      expect(ledger.balance(ACME, ACCOUNTS.INVENTORY)).toBe(0);
      expect(ledger.audit().balanced).toBe(true);
    });
  });

  describe('money conservation', () => {
    test('should keep total cash constant across a loan draw', () => {
      const ledger = new Ledger();

      // Bank starts with capital contributed from outside the system
      ledger.post({
        tick: 0,
        amount: 1000000,
        debit: { holder: BANK_HOLDER, account: ACCOUNTS.CASH },
        credit: { holder: BANK_HOLDER, account: ACCOUNTS.CONTRIBUTED_CAPITAL },
        kind: ENTRY_KINDS.SHARE_ISSUE
      });

      const cashBefore = ledger.totalAcrossHolders(ACCOUNTS.CASH);

      // A loan draw is a transfer plus a matched liability and receivable
      ledger.postMany([
        {
          tick: 10,
          amount: 50000,
          debit: { holder: ACME, account: ACCOUNTS.CASH },
          credit: { holder: ACME, account: ACCOUNTS.DEBT },
          kind: ENTRY_KINDS.LOAN_DRAW
        },
        {
          tick: 10,
          amount: 50000,
          debit: { holder: BANK_HOLDER, account: ACCOUNTS.LOAN_RECEIVABLE },
          credit: { holder: BANK_HOLDER, account: ACCOUNTS.CASH },
          kind: ENTRY_KINDS.LOAN_DRAW
        }
      ]);

      expect(ledger.totalAcrossHolders(ACCOUNTS.CASH)).toBe(cashBefore);
      expect(ledger.balance(ACME, ACCOUNTS.CASH)).toBe(50000);
      expect(ledger.balance(ACME, ACCOUNTS.DEBT)).toBe(50000);
      expect(ledger.balance(BANK_HOLDER, ACCOUNTS.LOAN_RECEIVABLE)).toBe(50000);
    });

    test('should keep total cash constant across arbitrary transfers', () => {
      const ledger = new Ledger();
      ledger.post({
        tick: 0,
        amount: 10000,
        debit: { holder: PLAYER, account: ACCOUNTS.CASH },
        credit: { holder: PLAYER, account: ACCOUNTS.CONTRIBUTED_CAPITAL }
      });

      const holders = [PLAYER, ACME, RIVAL, BANK_HOLDER];
      for (let i = 0; i < 50; i += 1) {
        const from = holders[i % holders.length];
        const to = holders[(i + 1) % holders.length];
        ledger.post({
          tick: i,
          amount: 25,
          debit: { holder: to, account: ACCOUNTS.CASH },
          credit: { holder: from, account: ACCOUNTS.CASH }
        });
      }

      expect(ledger.totalAcrossHolders(ACCOUNTS.CASH)).toBe(10000);
      expect(ledger.audit().balanced).toBe(true);
    });
  });

  describe('queries', () => {
    test('should filter by tick range', () => {
      const ledger = new Ledger();
      [1, 5, 10, 15].forEach(tick => ledger.post(entry({ tick })));

      expect(ledger.query({ fromTick: 5, toTick: 10 })).toHaveLength(2);
      expect(ledger.query({ fromTick: 0 })).toHaveLength(4);
      expect(ledger.query({ toTick: 1 })).toHaveLength(1);
    });

    test('should filter by holder on either leg', () => {
      const ledger = new Ledger();
      ledger.post(entry({
        debit: { holder: ACME, account: ACCOUNTS.CASH },
        credit: { holder: RIVAL, account: ACCOUNTS.CASH }
      }));
      ledger.post(entry({
        debit: { holder: PLAYER, account: ACCOUNTS.CASH },
        credit: { holder: PLAYER, account: ACCOUNTS.CONTRIBUTED_CAPITAL }
      }));

      expect(ledger.query({ holder: ACME })).toHaveLength(1);
      expect(ledger.query({ holder: RIVAL })).toHaveLength(1);
      expect(ledger.query({ holder: PLAYER })).toHaveLength(1);
    });

    test('should filter by kind', () => {
      const ledger = new Ledger();
      ledger.post(entry({ kind: ENTRY_KINDS.GOODS_PURCHASE }));
      ledger.post(entry({ kind: ENTRY_KINDS.DIVIDEND }));

      expect(ledger.query({ kind: ENTRY_KINDS.DIVIDEND })).toHaveLength(1);
    });

    test('should accept a holder key string', () => {
      const ledger = new Ledger();
      ledger.post(entry());
      expect(ledger.query({ holder: holderKey(ACME) })).toHaveLength(1);
      expect(ledger.balance(holderKey(ACME), ACCOUNTS.INVENTORY)).toBe(100);
    });
  });

  describe('periodMovement', () => {
    test('should sum revenue within a period only', () => {
      const ledger = new Ledger();
      const sale = (tick, amount) => ledger.post({
        tick,
        amount,
        debit: { holder: ACME, account: ACCOUNTS.CASH },
        credit: { holder: ACME, account: ACCOUNTS.REVENUE },
        kind: ENTRY_KINDS.GOODS_SALE
      });

      sale(10, 500);
      sale(2200, 700); // next quarter

      expect(ledger.periodMovement(ACME, ACCOUNTS.REVENUE, 0, 2159)).toBe(500);
      expect(ledger.periodMovement(ACME, ACCOUNTS.REVENUE, 2160, 4319)).toBe(700);
      expect(ledger.periodMovement(ACME, ACCOUNTS.REVENUE)).toBe(1200);
    });

    test('should net debits against credits on the same account', () => {
      const ledger = new Ledger();
      ledger.post({
        tick: 1,
        amount: 1000,
        debit: { holder: ACME, account: ACCOUNTS.CASH },
        credit: { holder: RIVAL, account: ACCOUNTS.CASH }
      });
      ledger.post({
        tick: 2,
        amount: 400,
        debit: { holder: RIVAL, account: ACCOUNTS.CASH },
        credit: { holder: ACME, account: ACCOUNTS.CASH }
      });

      expect(ledger.periodMovement(ACME, ACCOUNTS.CASH)).toBe(600);
      expect(ledger.periodMovement(RIVAL, ACCOUNTS.CASH)).toBe(-600);
    });

    test('should return zero for an untouched account', () => {
      expect(new Ledger().periodMovement(ACME, ACCOUNTS.REVENUE)).toBe(0);
    });
  });

  describe('holderBalances and listHolders', () => {
    test('should report only non-zero balances', () => {
      const ledger = new Ledger();
      ledger.post(entry({
        amount: 100,
        debit: { holder: ACME, account: ACCOUNTS.CASH },
        credit: { holder: RIVAL, account: ACCOUNTS.CASH }
      }));
      ledger.post(entry({
        amount: 100,
        debit: { holder: RIVAL, account: ACCOUNTS.CASH },
        credit: { holder: ACME, account: ACCOUNTS.CASH }
      }));

      // Net zero after the round trip, so nothing is reported
      expect(ledger.holderBalances(ACME)).toEqual({});
    });

    test('should list holders that have activity', () => {
      const ledger = new Ledger();
      ledger.post(entry({
        debit: { holder: ACME, account: ACCOUNTS.CASH },
        credit: { holder: RIVAL, account: ACCOUNTS.CASH }
      }));

      expect(ledger.listHolders()).toEqual([
        { kind: 'corporation', id: 'Acme Orbital' },
        { kind: 'corporation', id: 'Rival Freight' }
      ]);
    });

    test('should return an empty object for an unknown holder', () => {
      expect(new Ledger().holderBalances(ACME)).toEqual({});
    });
  });

  describe('audit', () => {
    test('should report a balanced empty ledger', () => {
      expect(new Ledger().audit()).toEqual({
        balanced: true,
        totalDebits: 0,
        totalCredits: 0,
        balancesMatch: true
      });
    });

    test('should confirm incremental balances match a full replay', () => {
      const ledger = new Ledger();
      for (let i = 1; i <= 100; i += 1) {
        ledger.post(entry({ tick: i, amount: i }));
      }

      const result = ledger.audit();
      expect(result.balanced).toBe(true);
      expect(result.balancesMatch).toBe(true);
      expect(result.totalDebits).toBe(result.totalCredits);
    });
  });

  describe('serialization', () => {
    test('should round trip entries and balances', () => {
      const ledger = new Ledger();
      ledger.post(entry({ tick: 3, amount: 1200 }));
      ledger.post(entry({
        tick: 4,
        amount: 800,
        debit: { holder: ACME, account: ACCOUNTS.CASH },
        credit: { holder: ACME, account: ACCOUNTS.REVENUE }
      }));

      const restored = Ledger.fromJSON(JSON.parse(JSON.stringify(ledger.toJSON())));

      expect(restored.entries).toHaveLength(2);
      expect(restored.balance(ACME, ACCOUNTS.INVENTORY)).toBe(1200);
      expect(restored.balance(ACME, ACCOUNTS.REVENUE)).toBe(800);
      expect(restored.audit().balancesMatch).toBe(true);
    });

    test('should continue assigning ids after a restore', () => {
      const ledger = new Ledger();
      ledger.post(entry());
      ledger.post(entry());

      const restored = Ledger.fromJSON(ledger.toJSON());
      expect(restored.post(entry()).id).toBe(3);
    });

    test('should repair nextEntryId when it is missing or stale', () => {
      const ledger = new Ledger();
      ledger.post(entry());
      ledger.post(entry());

      const data = ledger.toJSON();
      delete data.nextEntryId;

      expect(Ledger.fromJSON(data).post(entry()).id).toBe(3);
    });

    test('should return a usable ledger from missing data', () => {
      const restored = Ledger.fromJSON(undefined);
      expect(restored.entries).toEqual([]);
      expect(restored.post(entry()).id).toBe(1);
    });

    test('should carry a schema version', () => {
      expect(new Ledger().toJSON().schemaVersion).toBe(1);
    });
  });

  describe('rollupThrough', () => {
    /**
     * Build a ledger with a spread of activity across ticks.
     * @returns {Ledger} A populated ledger.
     */
    function busyLedger() {
      const ledger = new Ledger();
      ledger.post({
        tick: 0,
        amount: 100000,
        debit: { holder: ACME, account: ACCOUNTS.CASH },
        credit: { holder: ACME, account: ACCOUNTS.CONTRIBUTED_CAPITAL }
      });

      for (let tick = 1; tick <= 200; tick += 1) {
        ledger.post({
          tick,
          amount: 10,
          debit: { holder: RIVAL, account: ACCOUNTS.CASH },
          credit: { holder: ACME, account: ACCOUNTS.CASH },
          kind: ENTRY_KINDS.GOODS_SALE
        });
        ledger.post({
          tick,
          amount: 4,
          debit: { holder: ACME, account: ACCOUNTS.COGS },
          credit: { holder: ACME, account: ACCOUNTS.INVENTORY },
          kind: ENTRY_KINDS.COST_OF_SALE
        });
      }
      return ledger;
    }

    test('should do nothing when there is nothing old enough', () => {
      const ledger = busyLedger();
      expect(ledger.rollupThrough(-1)).toEqual({ removed: 0, added: 0 });
    });

    test('should ignore an invalid tick', () => {
      const ledger = busyLedger();
      const before = ledger.entries.length;
      expect(ledger.rollupThrough(NaN)).toEqual({ removed: 0, added: 0 });
      expect(ledger.entries).toHaveLength(before);
    });

    test('should replace old detail with far fewer entries', () => {
      const ledger = busyLedger();
      const before = ledger.entries.length;

      const result = ledger.rollupThrough(150);

      expect(result.removed).toBeGreaterThan(200);
      expect(result.added).toBeLessThan(result.removed);
      expect(ledger.entries.length).toBeLessThan(before);
    });

    test('should preserve every balance exactly', () => {
      const ledger = busyLedger();
      const accounts = [
        ACCOUNTS.CASH, ACCOUNTS.INVENTORY, ACCOUNTS.COGS, ACCOUNTS.CONTRIBUTED_CAPITAL
      ];
      const before = {};
      [ACME, RIVAL].forEach((holder, index) => {
        accounts.forEach(account => {
          before[`${index}:${account}`] = ledger.balance(holder, account);
        });
      });

      ledger.rollupThrough(150);

      [ACME, RIVAL].forEach((holder, index) => {
        accounts.forEach(account => {
          expect(ledger.balance(holder, account)).toBe(before[`${index}:${account}`]);
        });
      });
    });

    test('should stay balanced and keep incremental balances honest', () => {
      const ledger = busyLedger();
      ledger.rollupThrough(150);

      expect(ledger.audit()).toMatchObject({ balanced: true, balancesMatch: true });
    });

    test('should conserve total cash', () => {
      const ledger = busyLedger();
      const before = ledger.totalAcrossHolders(ACCOUNTS.CASH);

      ledger.rollupThrough(150);

      expect(ledger.totalAcrossHolders(ACCOUNTS.CASH)).toBe(before);
    });

    test('should keep entries newer than the cutoff untouched', () => {
      const ledger = busyLedger();
      const newerBefore = ledger.entries.filter(entry => entry.tick > 150).length;

      ledger.rollupThrough(150);

      expect(ledger.entries.filter(entry => entry.tick > 150)).toHaveLength(newerBefore);
    });

    test('should mark replacement entries as a period close', () => {
      const ledger = busyLedger();
      ledger.rollupThrough(150);

      const rolled = ledger.entries.filter(entry => entry.tick <= 150);
      expect(rolled.length).toBeGreaterThan(0);
      rolled.forEach(entry => {
        expect(entry.kind).toBe(ENTRY_KINDS.PERIOD_CLOSE);
        expect(entry.refs.rollup).toBe(true);
      });
    });

    test('should leave later period queries correct', () => {
      const ledger = busyLedger();
      const revenueAfter = ledger.periodMovement(ACME, ACCOUNTS.COGS, 151, 200);

      ledger.rollupThrough(150);

      // Detail inside the retained window must survive the compression
      expect(ledger.periodMovement(ACME, ACCOUNTS.COGS, 151, 200)).toBe(revenueAfter);
    });

    test('should survive a second rollup', () => {
      const ledger = busyLedger();
      ledger.rollupThrough(100);
      const cash = ledger.balance(ACME, ACCOUNTS.CASH);

      ledger.rollupThrough(180);

      expect(ledger.balance(ACME, ACCOUNTS.CASH)).toBe(cash);
      expect(ledger.audit()).toMatchObject({ balanced: true, balancesMatch: true });
    });

    test('should round trip through JSON after a rollup', () => {
      const ledger = busyLedger();
      ledger.rollupThrough(150);

      const restored = Ledger.fromJSON(JSON.parse(JSON.stringify(ledger.toJSON())));

      expect(restored.balance(ACME, ACCOUNTS.CASH)).toBe(ledger.balance(ACME, ACCOUNTS.CASH));
      expect(restored.audit()).toMatchObject({ balanced: true, balancesMatch: true });
    });

    test('should be deterministic', () => {
      const runOnce = () => {
        const ledger = busyLedger();
        ledger.rollupThrough(150);
        return JSON.stringify(ledger.toJSON());
      };
      expect(runOnce()).toBe(runOnce());
    });
  });
});
