import { HubSpotMockClient } from '../src/clients/HubSpotClient';
import { runStageD } from '../src/stages/stageD';
import { Clients, Deal, DealState } from '../src/types';
import { DEALS } from './fixtures/deals';

function makeClients(deals: Deal[]): Clients {
  return {
    hubspot: new HubSpotMockClient(deals),
    copilot: null as never,
    invoice: null as never,
    email: null as never,
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
    stages: { A: 'complete', B: 'complete', C: 'complete', D: 'pending', E: 'pending', F: 'pending', G: 'pending' },
    invoiceId: 'INV-TEST',
    teamsCardId: 'CARD-TEST',
    auditLog: [],
  };
}

describe('Stage D — deal tagging', () => {
  test('Platform Renewal: applies deal-type + event tags', async () => {
    const deal = DEALS[0]; // D-1001 Platform Renewal
    const clients = makeClients(DEALS);
    const state = makeState(deal.id);
    const result = await runStageD(deal, state, clients);

    expect(result.stages.D).toBe('complete');
    expect(result.tagsApplied).toContain('Platform Renewal');
    expect(result.tagsApplied).toContain('Global Alts Miami 2026');
    expect(result.tagsApplied).toContain('Family Office Summit NYC 2026');
    expect(result.tagsApplied).not.toContain('New Client');
    expect(result.tagsApplied).not.toContain('Event Only');
  });

  test('New Client: applies New Client tag + event tags', async () => {
    const deal = DEALS[1]; // D-1002 New Client
    const clients = makeClients(DEALS);
    const state = makeState(deal.id);
    const result = await runStageD(deal, state, clients);

    expect(result.stages.D).toBe('complete');
    expect(result.tagsApplied).toContain('New Client');
    expect(result.tagsApplied).toContain('Emerging Managers Summit 2026');
  });

  test('Event Only: applies Event Only tag + at least one event tag', async () => {
    const deal = DEALS[2]; // D-1003 Event Only
    const clients = makeClients(DEALS);
    const state = makeState(deal.id);
    const result = await runStageD(deal, state, clients);

    expect(result.stages.D).toBe('complete');
    expect(result.tagsApplied).toContain('Event Only');
    expect(result.tagsApplied?.some(t => deal.events.includes(t))).toBe(true);
  });

  test('idempotent: re-running does not duplicate tags', async () => {
    const deal = DEALS[0];
    const clients = makeClients(DEALS);
    const state = makeState(deal.id);
    const first = await runStageD(deal, state, clients);
    const second = await runStageD(deal, first, clients);

    expect(second.stages.D).toBe('complete');
    const tagSet = new Set(second.tagsApplied);
    expect(tagSet.size).toBe(second.tagsApplied?.length); // no duplicates
  });

  test('halts on conflicting deal-type tags', async () => {
    const deal = DEALS[0]; // Platform Renewal
    const hubspot = new HubSpotMockClient(DEALS);
    // Pre-seed a conflicting tag
    await hubspot.applyTags(deal.id, ['New Client']);
    const clients = { ...makeClients(DEALS), hubspot };
    const state = makeState(deal.id);
    const result = await runStageD(deal, state, clients);

    expect(result.stages.D).toBe('failed');
    expect(result.haltReason).toMatch(/conflicting/i);
  });

  test('does not overwrite correct existing tags', async () => {
    const deal = DEALS[0]; // Platform Renewal
    const hubspot = new HubSpotMockClient(DEALS);
    // Pre-seed correct tag
    await hubspot.applyTags(deal.id, ['Platform Renewal']);
    const clients = { ...makeClients(DEALS), hubspot };
    const state = makeState(deal.id);
    const result = await runStageD(deal, state, clients);

    expect(result.stages.D).toBe('complete');
    // Only one Platform Renewal tag
    const prTags = result.tagsApplied?.filter(t => t === 'Platform Renewal') ?? [];
    expect(prTags.length).toBe(1);
  });
});
