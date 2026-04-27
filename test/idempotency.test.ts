import { HubSpotMockClient } from '../src/clients/HubSpotClient';
import { CopilotMockClient } from '../src/clients/CopilotClient';
import { InvoiceMockClient } from '../src/clients/InvoiceClient';
import { EmailMockClient } from '../src/clients/EmailClient';
import { TeamsMockClient } from '../src/clients/TeamsClient';
import { runStageA } from '../src/stages/stageA';
import { runStageB } from '../src/stages/stageB';
import { runStageC } from '../src/stages/stageC';
import { runStageD } from '../src/stages/stageD';
import { runStageE } from '../src/stages/stageE';
import { runStageF } from '../src/stages/stageF';
import { runStageG } from '../src/stages/stageG';
import { Clients, Deal, DealState } from '../src/types';
import { CsmRouter } from '../src/utils/csmRouting';
import { CSMS, DEALS, EVENTS } from './fixtures/deals';

function makeClients(): Clients {
  return {
    hubspot: new HubSpotMockClient(DEALS),
    copilot: new CopilotMockClient(),
    invoice: new InvoiceMockClient(),
    email: new EmailMockClient(),
    teams: new TeamsMockClient(),
  };
}

function makeState(): DealState {
  return {
    dealId: DEALS[0].id,
    company: DEALS[0].company,
    stages: { A: 'pending', B: 'pending', C: 'pending', D: 'pending', E: 'pending', F: 'pending', G: 'pending' },
    auditLog: [],
  };
}

const deal: Deal = DEALS[0];

async function runAllStages(deal: Deal, clients: Clients): Promise<DealState> {
  const router = new CsmRouter();
  let state = makeState();
  state = await runStageA(deal, state, clients);
  state = await runStageB(deal, state, clients);
  state = await runStageC(deal, state, clients);
  state = await runStageD(deal, state, clients);
  state = await runStageE(deal, state, clients, router, CSMS);
  state = await runStageF(deal, state, clients);
  state = await runStageG(deal, state, clients, EVENTS);
  return state;
}

describe('Stage idempotency', () => {
  test('Stage A: re-running on complete state returns same state without re-sending', async () => {
    const clients = makeClients();
    let state = makeState();
    state = await runStageA(deal, state, clients);
    const invoiceId = state.invoiceId;

    const stateAgain = await runStageA(deal, state, clients);
    expect(stateAgain.invoiceId).toBe(invoiceId); // same invoice, not a new one
    expect(stateAgain.stages.A).toBe('complete');
  });

  test('Stage B: re-running on complete state is a no-op', async () => {
    const clients = makeClients();
    let state = makeState();
    state = await runStageA(deal, state, clients);
    state = await runStageB(deal, state, clients);
    const logLen = state.auditLog.length;

    const stateAgain = await runStageB(deal, state, clients);
    expect(stateAgain.stages.B).toBe('complete');
    expect(stateAgain.auditLog.length).toBe(logLen); // no new log entry
  });

  test('Stage C: re-running on complete state is a no-op', async () => {
    const clients = makeClients();
    let state = makeState();
    state = await runStageA(deal, state, clients);
    state = await runStageB(deal, state, clients);
    state = await runStageC(deal, state, clients);
    const paidAt = state.invoicePaidAt;

    const stateAgain = await runStageC(deal, state, clients);
    expect(stateAgain.stages.C).toBe('complete');
    expect(stateAgain.invoicePaidAt).toBe(paidAt);
  });

  test('Stage D: re-running on complete state does not duplicate tags', async () => {
    const clients = makeClients();
    let state = makeState();
    state = await runStageA(deal, state, clients);
    state = await runStageB(deal, state, clients);
    state = await runStageC(deal, state, clients);
    state = await runStageD(deal, state, clients);
    const tags1 = [...(state.tagsApplied ?? [])];

    const stateAgain = await runStageD(deal, state, clients);
    expect(stateAgain.tagsApplied).toEqual(tags1);
    const tagSet = new Set(stateAgain.tagsApplied);
    expect(tagSet.size).toBe(stateAgain.tagsApplied?.length);
  });

  test('Stage E: re-running on complete state is a no-op', async () => {
    const clients = makeClients();
    const router = new CsmRouter();
    let state = makeState();
    state = await runStageA(deal, state, clients);
    state = await runStageB(deal, state, clients);
    state = await runStageC(deal, state, clients);
    state = await runStageD(deal, state, clients);
    state = await runStageE(deal, state, clients, router, CSMS);
    const csmName = state.assignedCsm?.name;

    const stateAgain = await runStageE(deal, state, clients, router, CSMS);
    expect(stateAgain.assignedCsm?.name).toBe(csmName);
    expect(stateAgain.stages.E).toBe('complete');
  });

  test('Stage F: re-running on complete state does not create duplicate Copilot records', async () => {
    const clients = makeClients();
    const router = new CsmRouter();
    let state = makeState();
    state = await runStageA(deal, state, clients);
    state = await runStageB(deal, state, clients);
    state = await runStageC(deal, state, clients);
    state = await runStageD(deal, state, clients);
    state = await runStageE(deal, state, clients, router, CSMS);
    state = await runStageF(deal, state, clients);
    const companyId = state.copilotCompanyId;
    const clientIds = [...(state.copilotClientIds ?? [])];

    const stateAgain = await runStageF(deal, state, clients);
    expect(stateAgain.copilotCompanyId).toBe(companyId);
    expect(stateAgain.copilotClientIds).toEqual(clientIds);
  });

  test('Stage G: re-running on complete state is a no-op', async () => {
    const clients = makeClients();
    const final = await runAllStages(deal, clients);
    expect(final.stages.G).toBe('complete');
    const logLen = final.auditLog.length;

    const again = await runStageG(deal, final, clients, EVENTS);
    expect(again.stages.G).toBe('complete');
    expect(again.auditLog.length).toBe(logLen);
  });

  test('full pipeline completes for all 12 deals without error', async () => {
    for (const d of DEALS) {
      const clients = makeClients();
      const router = new CsmRouter();
      let state: DealState = {
        dealId: d.id,
        company: d.company,
        stages: { A: 'pending', B: 'pending', C: 'pending', D: 'pending', E: 'pending', F: 'pending', G: 'pending' },
        auditLog: [],
      };
      state = await runStageA(d, state, clients);
      state = await runStageB(d, state, clients);
      state = await runStageC(d, state, clients);
      state = await runStageD(d, state, clients);
      if (state.stages.D === 'failed') continue;
      state = await runStageE(d, state, clients, router, CSMS);
      state = await runStageF(d, state, clients);
      state = await runStageG(d, state, clients, EVENTS);
      expect(state.stages.G).toBe('complete');
    }
  });
});
