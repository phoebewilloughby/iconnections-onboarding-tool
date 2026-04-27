import { TeamsMockClient } from '../src/clients/TeamsClient';
import { Clients, Deal, DealState } from '../src/types';
import { DEALS, CSMS } from './fixtures/deals';

function makeDeal(): Deal {
  return DEALS[0]; // D-1001
}

function makeState(overrides: Partial<DealState> = {}): DealState {
  return {
    dealId: 'D-1001',
    company: 'Meridian Capital Partners',
    stages: { A: 'pending', B: 'pending', C: 'pending', D: 'pending', E: 'pending', F: 'pending', G: 'pending' },
    auditLog: [],
    ...overrides,
  };
}

describe('Teams card mutations', () => {
  let teams: TeamsMockClient;
  let deal: Deal;

  beforeEach(() => {
    teams = new TeamsMockClient();
    deal = makeDeal();
  });

  test('Stage A: card is created with Invoice sent checked', async () => {
    const state = makeState({ stages: { A: 'complete', B: 'pending', C: 'pending', D: 'pending', E: 'pending', F: 'pending', G: 'pending' }, invoiceSentAt: new Date().toISOString() });
    const cardId = await teams.createOnboardingCard(deal, state);

    expect(cardId).toBe('CARD-D-1001');
    const mutations = teams.getMutations(deal.id);
    expect(mutations).toHaveLength(1);
    expect(mutations[0].type).toBe('create');
    expect(mutations[0].cardState.invoiceSentChecked).toBe(true);
    expect(mutations[0].cardState.paymentReceivedChecked).toBe(false);
  });

  test('Stage C: patch checks Payment received with amount', async () => {
    const state = makeState({ stages: { A: 'complete', B: 'complete', C: 'complete', D: 'pending', E: 'pending', F: 'pending', G: 'pending' }, invoiceSentAt: new Date().toISOString(), invoicePaidAt: new Date().toISOString(), paymentAmount: 65_000 });
    const cardId = await teams.createOnboardingCard(deal, state);
    await teams.patchCard(cardId, deal, state, 'payment_received');

    const mutations = teams.getMutations(deal.id);
    expect(mutations).toHaveLength(2);
    const patch = mutations[1];
    expect(patch.type).toBe('patch');
    expect(patch.patchReason).toBe('payment_received');
    expect(patch.cardState.paymentReceivedChecked).toBe(true);
    expect(patch.cardState.paymentAmount).toBe(65_000);
  });

  test('Stage D: patch checks Deal tagged with tag list', async () => {
    const tags = ['Platform Renewal', 'Global Alts Miami 2026', 'Family Office Summit NYC 2026'];
    const state = makeState({ stages: { A: 'complete', B: 'complete', C: 'complete', D: 'complete', E: 'pending', F: 'pending', G: 'pending' }, tagsApplied: tags });
    const cardId = await teams.createOnboardingCard(deal, state);
    await teams.patchCard(cardId, deal, state, 'deal_tagged');

    const mutations = teams.getMutations(deal.id);
    const patch = mutations[1];
    expect(patch.cardState.dealTaggedChecked).toBe(true);
    expect(patch.cardState.dealTaggedTags).toEqual(tags);
  });

  test('Stage E: patch checks CSM assigned and includes @mention', async () => {
    const csm = CSMS[0]; // Marcus Whitfield
    const state = makeState({ stages: { A: 'complete', B: 'complete', C: 'complete', D: 'complete', E: 'complete', F: 'pending', G: 'pending' }, assignedCsm: csm });
    const cardId = await teams.createOnboardingCard(deal, state);
    await teams.patchCard(cardId, deal, state, 'csm_assigned', [csm.name]);

    const mutations = teams.getMutations(deal.id);
    const patch = mutations[1];
    expect(patch.cardState.csmAssignedChecked).toBe(true);
    expect(patch.cardState.csmAssignedName).toBe('Marcus Whitfield');
    expect(patch.cardState.mentions).toContain('Marcus Whitfield');
  });

  test('Stage E: @mention assigned CSM (not Sales Rep) on assignment patch', async () => {
    const csm = CSMS[0];
    const state = makeState({ stages: { A: 'complete', B: 'complete', C: 'complete', D: 'complete', E: 'complete', F: 'pending', G: 'pending' }, assignedCsm: csm });
    const cardId = await teams.createOnboardingCard(deal, state);
    await teams.patchCard(cardId, deal, state, 'csm_assigned', [csm.name]);

    const patch = teams.getMutations(deal.id)[1];
    expect(patch.cardState.mentions).not.toContain('Jordan Mills'); // Sales Rep not mentioned here
  });

  test('Stage F: patch checks Copilot registered with client/event counts', async () => {
    const state = makeState({ stages: { A: 'complete', B: 'complete', C: 'complete', D: 'complete', E: 'complete', F: 'complete', G: 'pending' }, copilotClientIds: ['CPCL-0001'] });
    const cardId = await teams.createOnboardingCard(deal, state);
    await teams.patchCard(cardId, deal, state, 'copilot_registered');

    const patch = teams.getMutations(deal.id)[1];
    expect(patch.cardState.copilotRegisteredChecked).toBe(true);
    expect(patch.cardState.copilotRegisteredClients).toBe(1);
  });

  test('Stage G: patch checks Onboarded and badge flips to Closed · Onboarded', async () => {
    const csm = CSMS[0];
    const state = makeState({ stages: { A: 'complete', B: 'complete', C: 'complete', D: 'complete', E: 'complete', F: 'complete', G: 'complete' }, assignedCsm: csm, copilotClientIds: ['CPCL-0001'] });
    const cardId = await teams.createOnboardingCard(deal, state);
    await teams.patchCard(cardId, deal, state, 'onboarded_closed_won');

    const patch = teams.getMutations(deal.id)[1];
    expect(patch.cardState.onboardedChecked).toBe(true);
    expect(patch.cardState.headerBadge).toBe('Closed · Onboarded');
  });

  test('Nudge 2: @mention Sales Rep on overdue patch', async () => {
    const state = makeState({ stages: { A: 'complete', B: 'complete', C: 'pending', D: 'pending', E: 'pending', F: 'pending', G: 'pending' }, needsHumanFollowUp: true, invoiceStatus: 'needs_human_followup' });
    const cardId = await teams.createOnboardingCard(deal, state);
    await teams.patchCard(cardId, deal, state, 'nudge2_overdue', [deal.salesRepName]);

    const patch = teams.getMutations(deal.id)[1];
    expect(patch.patchReason).toBe('nudge2_overdue');
    expect(patch.cardState.mentions).toContain(deal.salesRepName);
  });

  test('full A→G run produces 6 mutations (1 create + 5 patches)', async () => {
    const csm = CSMS[0];
    const baseState = { invoiceSentAt: new Date().toISOString(), invoicePaidAt: new Date().toISOString(), paymentAmount: 65_000, tagsApplied: ['Platform Renewal'], assignedCsm: csm, copilotClientIds: ['CPCL-0001'] };

    const stateA = makeState({ ...baseState, stages: { A: 'complete', B: 'pending', C: 'pending', D: 'pending', E: 'pending', F: 'pending', G: 'pending' } });
    const cardId = await teams.createOnboardingCard(deal, stateA);

    const stateC = makeState({ ...baseState, stages: { A: 'complete', B: 'complete', C: 'complete', D: 'pending', E: 'pending', F: 'pending', G: 'pending' } });
    await teams.patchCard(cardId, deal, stateC, 'payment_received');

    const stateD = makeState({ ...baseState, stages: { A: 'complete', B: 'complete', C: 'complete', D: 'complete', E: 'pending', F: 'pending', G: 'pending' } });
    await teams.patchCard(cardId, deal, stateD, 'deal_tagged');

    const stateE = makeState({ ...baseState, stages: { A: 'complete', B: 'complete', C: 'complete', D: 'complete', E: 'complete', F: 'pending', G: 'pending' } });
    await teams.patchCard(cardId, deal, stateE, 'csm_assigned', [csm.name]);

    const stateF = makeState({ ...baseState, stages: { A: 'complete', B: 'complete', C: 'complete', D: 'complete', E: 'complete', F: 'complete', G: 'pending' } });
    await teams.patchCard(cardId, deal, stateF, 'copilot_registered');

    const stateG = makeState({ ...baseState, stages: { A: 'complete', B: 'complete', C: 'complete', D: 'complete', E: 'complete', F: 'complete', G: 'complete' } });
    await teams.patchCard(cardId, deal, stateG, 'onboarded_closed_won');

    const mutations = teams.getMutations(deal.id);
    expect(mutations).toHaveLength(6); // 1 create + 5 patches
    expect(mutations[0].type).toBe('create');
    expect(mutations.slice(1).every(m => m.type === 'patch')).toBe(true);
    expect(mutations[5].cardState.onboardedChecked).toBe(true);
  });
});
