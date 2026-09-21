const {
  ACCOUNTS,
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_BY_ACCOUNT,
  HOLDER_KINDS,
  BANK_HOLDER,
  INVESTOR_POOL_HOLDER,
  isKnownAccount,
  accountType,
  increasesOnDebit,
  holderKey,
  parseHolderKey,
  corporationHolder,
  playerHolder
} = require('./accounts');

describe('accounts', () => {
  test('should classify every declared account', () => {
    Object.values(ACCOUNTS).forEach(account => {
      expect(isKnownAccount(account)).toBe(true);
      expect(Object.values(ACCOUNT_TYPES)).toContain(accountType(account));
    });
  });

  test('should have no account classified twice or missed', () => {
    expect(Object.keys(ACCOUNT_TYPE_BY_ACCOUNT).sort())
      .toEqual(Object.values(ACCOUNTS).sort());
  });

  test('should reject unknown accounts', () => {
    expect(isKnownAccount('imaginary')).toBe(false);
    expect(isKnownAccount(undefined)).toBe(false);
    expect(accountType('imaginary')).toBeNull();
  });

  describe('increasesOnDebit', () => {
    test('should be true for assets and expenses', () => {
      expect(increasesOnDebit(ACCOUNTS.CASH)).toBe(true);
      expect(increasesOnDebit(ACCOUNTS.INVENTORY)).toBe(true);
      expect(increasesOnDebit(ACCOUNTS.PROPERTY)).toBe(true);
      expect(increasesOnDebit(ACCOUNTS.INVESTMENTS)).toBe(true);
      expect(increasesOnDebit(ACCOUNTS.LOAN_RECEIVABLE)).toBe(true);
      expect(increasesOnDebit(ACCOUNTS.COGS)).toBe(true);
      expect(increasesOnDebit(ACCOUNTS.INTEREST_EXPENSE)).toBe(true);
      expect(increasesOnDebit(ACCOUNTS.OPERATING_EXPENSE)).toBe(true);
    });

    test('should be false for liabilities, equity, and income', () => {
      expect(increasesOnDebit(ACCOUNTS.DEBT)).toBe(false);
      expect(increasesOnDebit(ACCOUNTS.SHARE_CAPITAL)).toBe(false);
      expect(increasesOnDebit(ACCOUNTS.CONTRIBUTED_CAPITAL)).toBe(false);
      expect(increasesOnDebit(ACCOUNTS.RETAINED_EARNINGS)).toBe(false);
      expect(increasesOnDebit(ACCOUNTS.REVENUE)).toBe(false);
    });

    test('should be false for an unknown account', () => {
      expect(increasesOnDebit('imaginary')).toBe(false);
    });
  });

  describe('holderKey', () => {
    test('should build a stable key', () => {
      expect(holderKey({ kind: 'corporation', id: 'Acme Orbital' }))
        .toBe('corporation:Acme Orbital');
    });

    test('should reject malformed holders', () => {
      expect(() => holderKey(null)).toThrow(TypeError);
      expect(() => holderKey('string')).toThrow(TypeError);
      expect(() => holderKey({ kind: 'corporation' })).toThrow(/non-empty kind and id/);
      expect(() => holderKey({ id: 'x' })).toThrow(/non-empty kind and id/);
      expect(() => holderKey({ kind: 'corporation', id: '' })).toThrow(/non-empty kind and id/);
    });

    test('should accept a numeric id', () => {
      expect(holderKey({ kind: 'corporation', id: 7 })).toBe('corporation:7');
    });
  });

  describe('parseHolderKey', () => {
    test('should round trip a holder', () => {
      const holder = { kind: 'corporation', id: 'Acme Orbital' };
      expect(parseHolderKey(holderKey(holder))).toEqual(holder);
    });

    test('should keep colons in the id', () => {
      expect(parseHolderKey('corporation:Weird:Name'))
        .toEqual({ kind: 'corporation', id: 'Weird:Name' });
    });

    test('should handle a key with no separator', () => {
      expect(parseHolderKey('bare')).toEqual({ kind: '', id: 'bare' });
    });
  });

  describe('holder builders', () => {
    test('should build a corporation holder from an instance or a name', () => {
      expect(corporationHolder({ name: 'Acme Orbital' }))
        .toEqual({ kind: HOLDER_KINDS.CORPORATION, id: 'Acme Orbital' });
      expect(corporationHolder('Acme Orbital'))
        .toEqual({ kind: HOLDER_KINDS.CORPORATION, id: 'Acme Orbital' });
    });

    test('should build a player holder from an instance or a name', () => {
      expect(playerHolder({ name: 'TestPlayer' }))
        .toEqual({ kind: HOLDER_KINDS.PLAYER, id: 'TestPlayer' });
      expect(playerHolder('TestPlayer'))
        .toEqual({ kind: HOLDER_KINDS.PLAYER, id: 'TestPlayer' });
    });

    test('should produce keyable singleton holders', () => {
      expect(holderKey(BANK_HOLDER)).toBe('bank:interstellar_bank');
      expect(holderKey(INVESTOR_POOL_HOLDER)).toBe('investor_pool:public');
    });
  });
});
