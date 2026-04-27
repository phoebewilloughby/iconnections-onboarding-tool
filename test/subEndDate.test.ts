import { HubSpotMockClient } from '../src/clients/HubSpotClient';
import { CopilotMockClient } from '../src/clients/CopilotClient';
import { InvoiceMockClient } from '../src/clients/InvoiceClient';
import { EmailMockClient } from '../src/clients/EmailClient';
import { TeamsMockClient } from '../src/clients/TeamsClient';
import { runStageF } from '../src/stages/stageF';
import { Clients, Deal, DealState } from '../src/types';
import { DEALS } from './fixtures/deals';

function makeClients(): Clients {
  return {
    hubspot: new HubSpotMockClient(DEALS),
    copilot: new CopilotMockClient(),
    invoice: new InvoiceMockClient(),
    email: new EmailMockClient(),
    teams: {
      postDealWon: jest.fn(),
      createOnboardingCard: jest.fn().mockResolvedValue('CARD-TEST'),
      patchCard: jest.fn(),
    } as never,
  };
}

function makeState(dealId: string): DealState {
  return {
    dealId,
    company: 'Test',
    stages: { A: 'complete', B: 'complete', C: 'complete', D: 'complete', E: 'complete', F: 'pending', G: 'pending' },
    invoiceId: 'INV-TEST',
    teamsCardId: 'CARD-TEST',
    assignedCsm: { name: 'Test CSM', tier: 'Scale', email: 'csm@test.com', region: 'Americas' },
    auditLog: [],
  };
}

describe('Subscription end date calculation', () => {
  test('Platform Renewal: new sub end = existing sub end + 12 months', async () => {
    const deal = DEALS[0]; // D-1001 Platform Renewal, subEnd 2027-05-31
    expect(deal.dealType).toBe('Platform Renewal');
    expect(deal.subscriptionEndDate).toBe('2027-05-31');

    const clients = makeClients();
    const state = makeState(deal.id);
    const result = await runStageF(deal, state, clients);

    expect(result.stages.F).toBe('complete');

    // Check Copilot was updated with the extended date
    const copilot = clients.copilot as CopilotMockClient;
    const company = copilot.getCompany(result.copilotCompanyId!);
    expect(company?.subscriptionEndDate).toBe('2028-05-31'); // +12 months
  });

  test('New Client: sub end is used as-is from the deal record', async () => {
    const deal = DEALS[1]; // D-1002 New Client, subEnd 2027-05-15
    expect(deal.dealType).toBe('New Client');
    expect(deal.subscriptionEndDate).toBe('2027-05-15');

    const clients = makeClients();
    const state = makeState(deal.id);
    const result = await runStageF(deal, state, clients);

    const copilot = clients.copilot as CopilotMockClient;
    const company = copilot.getCompany(result.copilotCompanyId!);
    expect(company?.subscriptionEndDate).toBe('2027-05-15'); // unchanged
  });

  test('Event Only: subscription end date is NOT set on Copilot', async () => {
    const deal = DEALS[2]; // D-1003 Event Only, subEnd null
    expect(deal.dealType).toBe('Event Only');
    expect(deal.subscriptionEndDate).toBeNull();

    const clients = makeClients();
    const state = makeState(deal.id);
    const result = await runStageF(deal, state, clients);

    const copilot = clients.copilot as CopilotMockClient;
    const company = copilot.getCompany(result.copilotCompanyId!);
    expect(company?.subscriptionEndDate).toBeUndefined();
  });

  test('all four Platform Renewal deals get +12 months from their deal sub end', async () => {
    const renewals = DEALS.filter(d => d.dealType === 'Platform Renewal');
    expect(renewals).toHaveLength(4); // D-1001, D-1006, D-1008, D-1009

    for (const deal of renewals) {
      const clients = makeClients();
      const state = makeState(deal.id);
      await runStageF(deal, state, clients);

      const copilot = clients.copilot as CopilotMockClient;
      const company = copilot.getCompany(state.copilotCompanyId ?? '');

      const existing = new Date(deal.subscriptionEndDate!);
      const expected = new Date(existing);
      expected.setMonth(expected.getMonth() + 12);

      expect(company?.subscriptionEndDate).toBe(expected.toISOString().slice(0, 10));
    }
  });
});
