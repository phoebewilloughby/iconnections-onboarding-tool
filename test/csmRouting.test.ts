import { CsmRouter, determineTier, detectRegion } from '../src/utils/csmRouting';
import { CSMS, DEALS } from './fixtures/deals';
import { Deal } from '../src/types';

function makeDeal(overrides: Partial<Deal>): Deal {
  return {
    id: 'D-TEST',
    company: 'Test Co',
    aumDollars: 100_000_000,
    invoiceAmount: 10_000,
    dealType: 'New Client',
    primaryContact: { name: 'Test User', email: 'test@example.com', mobile: '+1 212 000 0000' },
    events: [],
    subscriptionEndDate: null,
    salesRepName: 'Rep',
    salesRepEmail: 'rep@iconnections.io',
    ...overrides,
  };
}

describe('determineTier', () => {
  test('Enterprise when invoice > $25,000', () => {
    expect(determineTier(makeDeal({ invoiceAmount: 25_001, aumDollars: 500_000_000 }))).toBe('Enterprise');
  });

  test('Enterprise when AUM > $1B regardless of invoice', () => {
    expect(determineTier(makeDeal({ invoiceAmount: 10_000, aumDollars: 1_000_000_001 }))).toBe('Enterprise');
  });

  test('Enterprise when BOTH invoice > $25k AND AUM > $1B', () => {
    expect(determineTier(makeDeal({ invoiceAmount: 50_000, aumDollars: 2_000_000_000 }))).toBe('Enterprise');
  });

  test('Scale when invoice <= $25,000 AND AUM <= $1B', () => {
    expect(determineTier(makeDeal({ invoiceAmount: 25_000, aumDollars: 1_000_000_000 }))).toBe('Scale');
  });

  test('Scale when invoice < $25,000 and AUM < $1B', () => {
    expect(determineTier(makeDeal({ invoiceAmount: 12_000, aumDollars: 210_000_000 }))).toBe('Scale');
  });
});

describe('detectRegion', () => {
  test('+1 → Americas', () => expect(detectRegion('+1 212 555 0134')).toBe('Americas'));
  test('+1 with various formats → Americas', () => expect(detectRegion('+1-415-555-0289')).toBe('Americas'));
  test('+44 → EMEA', () => expect(detectRegion('+44 20 7946 0412')).toBe('EMEA'));
  test('+41 → EMEA', () => expect(detectRegion('+41 44 555 0193')).toBe('EMEA'));
  test('+353 → EMEA', () => expect(detectRegion('+353 1 555 0329')).toBe('EMEA'));
  test('+65 → APAC', () => expect(detectRegion('+65 6555 0287')).toBe('APAC'));
  test('unknown prefix → Global', () => expect(detectRegion('+27 21 555 0100')).toBe('Global'));
});

describe('CsmRouter.assignCsm', () => {
  test('D-1001 (Enterprise, Americas) → Marcus Whitfield', () => {
    const router = new CsmRouter();
    const csm = router.assignCsm(DEALS[0], CSMS);
    expect(csm.name).toBe('Marcus Whitfield');
    expect(csm.tier).toBe('Enterprise');
    expect(csm.region).toBe('Americas');
  });

  test('D-1002 (Scale, Americas) → Tessa Nguyen', () => {
    const router = new CsmRouter();
    const csm = router.assignCsm(DEALS[1], CSMS);
    expect(csm.name).toBe('Tessa Nguyen');
    expect(csm.tier).toBe('Scale');
  });

  test('D-1003 (Enterprise, EMEA) → Priya Anand', () => {
    const router = new CsmRouter();
    const csm = router.assignCsm(DEALS[2], CSMS);
    expect(csm.name).toBe('Priya Anand');
    expect(csm.region).toBe('EMEA');
  });

  test('D-1009 (Enterprise, APAC) → James Calloway', () => {
    const router = new CsmRouter();
    const csm = router.assignCsm(DEALS[8], CSMS);
    expect(csm.name).toBe('James Calloway');
    expect(csm.region).toBe('APAC');
  });

  test('D-1010 (Scale, EMEA) → Ryan O\'Brien', () => {
    const router = new CsmRouter();
    const csm = router.assignCsm(DEALS[9], CSMS);
    expect(csm.name).toBe("Ryan O'Brien");
    expect(csm.tier).toBe('Scale');
  });

  test('all 12 deals get an assigned CSM', () => {
    const router = new CsmRouter();
    for (const deal of DEALS) {
      const csm = router.assignCsm(deal, CSMS);
      expect(csm).toBeDefined();
      expect(csm.name).toBeTruthy();
    }
  });

  test('round-robin cycles through multiple CSMs in same region pool', () => {
    const extraCsm = { name: 'Alex Rivera', tier: 'Scale' as const, email: 'arivera@iconnections.io', region: 'Americas' as const };
    const extendedCsms = [...CSMS, extraCsm];
    const router = new CsmRouter();
    const a1 = router.assignCsm(makeDeal({ invoiceAmount: 5_000, aumDollars: 100_000_000, primaryContact: { name: 'X', email: 'x@x.com', mobile: '+1 212 000 0001' } }), extendedCsms);
    const a2 = router.assignCsm(makeDeal({ invoiceAmount: 5_000, aumDollars: 100_000_000, primaryContact: { name: 'X', email: 'x@x.com', mobile: '+1 212 000 0002' } }), extendedCsms);
    const a3 = router.assignCsm(makeDeal({ invoiceAmount: 5_000, aumDollars: 100_000_000, primaryContact: { name: 'X', email: 'x@x.com', mobile: '+1 212 000 0003' } }), extendedCsms);
    expect(a1.name).toBe(a3.name); // cycles back to first
    expect(a1.name).not.toBe(a2.name);
  });

  test('strictly regional: Global CSMs are NOT assigned to Americas contacts', () => {
    const router = new CsmRouter();
    const csm = router.assignCsm(DEALS[1], CSMS); // D-1002 Scale, Americas
    expect(csm.region).toBe('Americas');
    expect(csm.name).not.toBe('Hannah Petrov'); // Hannah is Global, must not be used here
  });

  test('strictly regional: unknown phone prefix resolves to Global region → assigns Global CSM', () => {
    const router = new CsmRouter();
    const globalDeal = makeDeal({ invoiceAmount: 5_000, aumDollars: 100_000_000, primaryContact: { name: 'X', email: 'x@x.com', mobile: '+27 21 000 0001' } });
    const csm = router.assignCsm(globalDeal, CSMS);
    expect(csm.region).toBe('Global');
    expect(csm.name).toBe('Hannah Petrov');
  });

  test('strictly regional: throws if no CSM configured for detected region+tier', () => {
    const router = new CsmRouter();
    const apacScaleDeal = makeDeal({ invoiceAmount: 5_000, aumDollars: 100_000_000, primaryContact: { name: 'X', email: 'x@x.com', mobile: '+65 9000 0001' } });
    // No Scale/APAC CSM in fixture
    expect(() => router.assignCsm(apacScaleDeal, CSMS)).toThrow(/No Scale CSM.*APAC/);
  });

  test('8 Enterprise deals and 4 Scale deals across 12 fixtures', () => {
    const router = new CsmRouter();
    let enterprise = 0, scale = 0;
    for (const deal of DEALS) {
      const csm = router.assignCsm(deal, CSMS);
      if (csm.tier === 'Enterprise') enterprise++;
      else scale++;
    }
    expect(enterprise).toBe(8);
    expect(scale).toBe(4);
  });
});
