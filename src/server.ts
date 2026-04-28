import express from 'express';
import path from 'path';
import type { Response } from 'express';

import { HubSpotMockClient } from './clients/HubSpotClient';
import { CopilotMockClient } from './clients/CopilotClient';
import { InvoiceMockClient } from './clients/InvoiceClient';
import { EmailMockClient } from './clients/EmailClient';
import { TeamsMockClient } from './clients/TeamsClient';
import type { SentEmail } from './clients/EmailClient';
import { generateReplies } from './utils/clientReplies';
import type { AuditEntry, ClientReply } from './types';
import { Clients, Deal, DealState, PaymentBehavior } from './types';
import { CsmRouter } from './utils/csmRouting';
import { DEALS, CSMS, EVENTS } from '../test/fixtures/deals';
import { runStageA } from './stages/stageA';
import { runStageB, sendNudge1, sendNudge2 } from './stages/stageB';
import { runStageC } from './stages/stageC';
import { runStageD } from './stages/stageD';
import { runStageE } from './stages/stageE';
import { runStageF } from './stages/stageF';
import { runStageG } from './stages/stageG';

const app = express();
app.use(express.json());
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// ── SSE ────────────────────────────────────────────────────────────────────────

const sseClients = new Set<Response>();

function broadcast(event: string, data: unknown): void {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(res => res.write(msg));
}

// ── State ──────────────────────────────────────────────────────────────────────

let isBulkRunning = false;
let dealStates: Map<string, DealState> = new Map();
let nextDealId = 3000;

const dealClients: Map<string, { email: EmailMockClient; teams: TeamsMockClient }> = new Map();
const dealReplies: Map<string, ClientReply[]> = new Map();

function makeInitialState(deal: Deal): DealState {
  return {
    dealId: deal.id,
    company: deal.company,
    stages: { A: 'pending', B: 'pending', C: 'pending', D: 'pending', E: 'pending', F: 'pending', G: 'pending' },
    auditLog: [],
  };
}

// ── Pre-seeded demo states ─────────────────────────────────────────────────────
// These deals start in mid-pipeline so the dashboard looks populated on first load.

const DEMO_STATES: Map<string, DealState> = new Map([
  ['D-2001', {
    dealId: 'D-2001', company: 'Arrowhead Global Capital',
    stages: { A: 'complete', B: 'complete', C: 'complete', D: 'complete', E: 'complete', F: 'complete', G: 'complete' },
    invoiceId: 'INV-2001', invoiceStatus: 'paid',
    invoiceSentAt: '2026-04-25T09:15:22Z', invoicePaidAt: '2026-04-25T09:16:04Z',
    paymentAmount: 45_000, dueDate: '2026-05-25',
    nudge1Date: '2026-05-10', nudge2Date: '2026-05-18', nudgesSent: [],
    tagsApplied: ['Platform Renewal', 'Global Alts Miami 2026', 'Asia Pacific Forum Singapore 2026'],
    tagsExisting: [], tagsNewlyApplied: ['Platform Renewal', 'Global Alts Miami 2026', 'Asia Pacific Forum Singapore 2026'],
    assignedCsm: { name: 'Marcus Whitfield', tier: 'Enterprise', email: 'mwhitfield@iconnections.io', region: 'Americas' },
    csmReasoning: 'Enterprise tier (AUM $1.5B > $1B threshold), Americas region (+1 prefix) → Marcus Whitfield',
    copilotCompanyId: 'CPNY-2001-ARWG', copilotClientIds: ['CLT-2001-DC'],
    computedSubEndDate: '2027-05-31', teamsCardId: 'TC-2001', teamsMutationCount: 7,
    auditLog: [
      { timestamp: '2026-04-25T09:15:22Z', stage: 'A', action: 'invoice_sent', data: { invoiceId: 'INV-2001', amount: 45000 } },
      { timestamp: '2026-04-25T09:21:08Z', stage: 'B', action: 'nudge_schedule_created', data: { nudge1: '2026-05-10', nudge2: '2026-05-18' } },
      { timestamp: '2026-04-25T09:21:44Z', stage: 'C', action: 'payment_received', data: { amount: 45000, paidAt: '2026-04-25T09:16:04Z' } },
      { timestamp: '2026-04-25T09:27:31Z', stage: 'D', action: 'tags_applied', data: { tags: ['Platform Renewal', 'Global Alts Miami 2026', 'Asia Pacific Forum Singapore 2026'] } },
      { timestamp: '2026-04-25T09:33:14Z', stage: 'E', action: 'csm_assigned', data: { csm: 'Marcus Whitfield', tier: 'Enterprise', region: 'Americas' } },
      { timestamp: '2026-04-25T09:38:57Z', stage: 'F', action: 'copilot_registered', data: { companyId: 'CPNY-2001-ARWG', clients: 1, events: 2 } },
      { timestamp: '2026-04-25T09:44:40Z', stage: 'G', action: 'deal_closed_onboarded', data: { dealId: 'D-2001' } },
    ],
  }],
  ['D-2002', {
    dealId: 'D-2002', company: 'Clearwater Partners Group',
    stages: { A: 'complete', B: 'complete', C: 'complete', D: 'complete', E: 'complete', F: 'complete', G: 'complete' },
    invoiceId: 'INV-2002', invoiceStatus: 'paid',
    invoiceSentAt: '2026-04-24T14:02:11Z', invoicePaidAt: '2026-04-24T14:03:05Z',
    paymentAmount: 15_500, dueDate: '2026-05-24',
    nudge1Date: '2026-05-08', nudge2Date: '2026-05-16', nudgesSent: [],
    tagsApplied: ['New Client', 'Emerging Managers Summit 2026'],
    tagsExisting: [], tagsNewlyApplied: ['New Client', 'Emerging Managers Summit 2026'],
    assignedCsm: { name: 'Tessa Nguyen', tier: 'Scale', email: 'tnguyen@iconnections.io', region: 'Americas' },
    csmReasoning: 'Scale tier (AUM $320M, invoice $15,500 — below both thresholds), Americas region (+1 prefix) → Tessa Nguyen',
    copilotCompanyId: 'CPNY-2002-CPG', copilotClientIds: ['CLT-2002-LS'],
    computedSubEndDate: '2027-04-30', teamsCardId: 'TC-2002', teamsMutationCount: 7,
    auditLog: [
      { timestamp: '2026-04-24T14:02:11Z', stage: 'A', action: 'invoice_sent', data: { invoiceId: 'INV-2002', amount: 15500 } },
      { timestamp: '2026-04-24T14:08:33Z', stage: 'B', action: 'nudge_schedule_created', data: { nudge1: '2026-05-08', nudge2: '2026-05-16' } },
      { timestamp: '2026-04-24T14:09:17Z', stage: 'C', action: 'payment_received', data: { amount: 15500, paidAt: '2026-04-24T14:03:05Z' } },
      { timestamp: '2026-04-24T14:14:55Z', stage: 'D', action: 'tags_applied', data: { tags: ['New Client', 'Emerging Managers Summit 2026'] } },
      { timestamp: '2026-04-24T14:20:38Z', stage: 'E', action: 'csm_assigned', data: { csm: 'Tessa Nguyen', tier: 'Scale', region: 'Americas' } },
      { timestamp: '2026-04-24T14:26:21Z', stage: 'F', action: 'copilot_registered', data: { companyId: 'CPNY-2002-CPG', clients: 1, events: 1 } },
      { timestamp: '2026-04-24T14:32:04Z', stage: 'G', action: 'deal_closed_onboarded', data: { dealId: 'D-2002' } },
    ],
  }],
  ['D-2003', {
    dealId: 'D-2003', company: 'Vega Quantitative Strategies',
    stages: { A: 'complete', B: 'complete', C: 'complete', D: 'complete', E: 'complete', F: 'running', G: 'pending' },
    invoiceId: 'INV-2003', invoiceStatus: 'paid',
    invoiceSentAt: '2026-04-26T11:05:44Z', invoicePaidAt: '2026-04-26T11:06:31Z',
    paymentAmount: 55_000, dueDate: '2026-05-26',
    nudge1Date: '2026-05-11', nudge2Date: '2026-05-19', nudgesSent: [],
    tagsApplied: ['New Client', 'European Allocator Series London 2026', 'Global Alts Miami 2026'],
    tagsExisting: [], tagsNewlyApplied: ['New Client', 'European Allocator Series London 2026', 'Global Alts Miami 2026'],
    assignedCsm: { name: 'Priya Anand', tier: 'Enterprise', email: 'panand@iconnections.io', region: 'EMEA' },
    csmReasoning: 'Enterprise tier (AUM $2.1B > $1B, invoice $55k > $25k), EMEA region (+44 prefix) → Priya Anand',
    teamsCardId: 'TC-2003', teamsMutationCount: 5,
    auditLog: [
      { timestamp: '2026-04-26T11:05:44Z', stage: 'A', action: 'invoice_sent', data: { invoiceId: 'INV-2003', amount: 55000 } },
      { timestamp: '2026-04-26T11:12:02Z', stage: 'B', action: 'nudge_schedule_created', data: { nudge1: '2026-05-11', nudge2: '2026-05-19' } },
      { timestamp: '2026-04-26T11:12:48Z', stage: 'C', action: 'payment_received', data: { amount: 55000 } },
      { timestamp: '2026-04-26T11:18:31Z', stage: 'D', action: 'tags_applied', data: { tags: ['New Client', 'European Allocator Series London 2026', 'Global Alts Miami 2026'] } },
      { timestamp: '2026-04-26T11:24:14Z', stage: 'E', action: 'csm_assigned', data: { csm: 'Priya Anand', tier: 'Enterprise', region: 'EMEA' } },
    ],
  }],
  ['D-2004', {
    dealId: 'D-2004', company: 'Thornfield Asset Management',
    stages: { A: 'complete', B: 'complete', C: 'complete', D: 'running', E: 'pending', F: 'pending', G: 'pending' },
    invoiceId: 'INV-2004', invoiceStatus: 'paid',
    invoiceSentAt: '2026-04-27T08:33:19Z', invoicePaidAt: '2026-04-27T20:45:02Z',
    paymentAmount: 18_000, dueDate: '2026-05-27',
    nudge1Date: '2026-05-12', nudge2Date: '2026-05-20', nudgesSent: ['nudge1'],
    teamsCardId: 'TC-2004', teamsMutationCount: 3,
    auditLog: [
      { timestamp: '2026-04-27T08:33:19Z', stage: 'A', action: 'invoice_sent', data: { invoiceId: 'INV-2004', amount: 18000 } },
      { timestamp: '2026-04-27T08:39:47Z', stage: 'B', action: 'nudge_schedule_created', data: { nudge1: '2026-05-12', nudge2: '2026-05-20' } },
      { timestamp: '2026-04-27T08:47:22Z', stage: 'B', action: 'nudge1_sent', data: { sentAt: '2026-04-27T08:47:22Z' } },
      { timestamp: '2026-04-27T20:51:08Z', stage: 'C', action: 'payment_received', data: { amount: 18000 } },
    ],
  }],
  ['D-2005', {
    dealId: 'D-2005', company: 'Pacific Rim Ventures',
    stages: { A: 'complete', B: 'complete', C: 'pending', D: 'pending', E: 'pending', F: 'pending', G: 'pending' },
    invoiceId: 'INV-2005', invoiceStatus: 'needs_human_followup',
    invoiceSentAt: '2026-04-26T16:22:07Z',
    dueDate: '2026-05-26', nudge1Date: '2026-05-11', nudge2Date: '2026-05-19',
    nudgesSent: ['nudge1', 'nudge2'], needsHumanFollowUp: true,
    teamsCardId: 'TC-2005', teamsMutationCount: 3,
    auditLog: [
      { timestamp: '2026-04-26T16:22:07Z', stage: 'A', action: 'invoice_sent', data: { invoiceId: 'INV-2005', amount: 62000 } },
      { timestamp: '2026-04-26T16:28:45Z', stage: 'B', action: 'nudge_schedule_created', data: { nudge1: '2026-05-11', nudge2: '2026-05-19' } },
      { timestamp: '2026-04-26T16:36:33Z', stage: 'B', action: 'nudge1_sent' },
      { timestamp: '2026-04-26T16:44:21Z', stage: 'B', action: 'nudge2_sent' },
      { timestamp: '2026-04-27T09:15:44Z', stage: 'C', action: 'flagged_needs_followup', data: { reason: 'Payment not received after maximum wait — manual follow-up required' } },
    ],
  }],
  ['D-2006', {
    dealId: 'D-2006', company: 'Kingsley Credit Advisors',
    stages: { A: 'complete', B: 'complete', C: 'complete', D: 'failed', E: 'pending', F: 'pending', G: 'pending' },
    invoiceId: 'INV-2006', invoiceStatus: 'paid',
    invoiceSentAt: '2026-04-27T13:44:56Z', invoicePaidAt: '2026-04-27T13:45:38Z',
    paymentAmount: 38_000, dueDate: '2026-05-27',
    nudge1Date: '2026-05-12', nudge2Date: '2026-05-20', nudgesSent: [],
    haltReason: 'Conflicting deal-type tags: found [Platform Renewal], expected New Client',
    teamsCardId: 'TC-2006', teamsMutationCount: 3,
    auditLog: [
      { timestamp: '2026-04-27T13:44:56Z', stage: 'A', action: 'invoice_sent', data: { invoiceId: 'INV-2006', amount: 38000 } },
      { timestamp: '2026-04-27T13:51:14Z', stage: 'B', action: 'nudge_schedule_created' },
      { timestamp: '2026-04-27T13:51:52Z', stage: 'C', action: 'payment_received', data: { amount: 38000 } },
      { timestamp: '2026-04-27T13:57:35Z', stage: 'D', action: 'halt_conflicting_tags', data: { conflicting: ['Platform Renewal'], expected: 'New Client' } },
    ],
  }],
]);

function resetAllStates(): void {
  dealStates = new Map(DEALS.map(d => [d.id, DEMO_STATES.get(d.id) ?? makeInitialState(d)]));
  dealClients.clear();
  dealReplies.clear();
}

resetAllStates();

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ── Payment delay map ──────────────────────────────────────────────────────────

const PAYMENT_DELAYS: Record<PaymentBehavior, number> = {
  immediate:      0,
  after_nudge1:   12_000,
  after_nudge2:   24_000,
  needs_followup: 999_999_999,
};

// ── Pipeline helpers ───────────────────────────────────────────────────────────

function makeClients(deal: Deal): Clients {
  const delayMs = PAYMENT_DELAYS[deal.paymentBehavior ?? 'immediate'];
  const email = new EmailMockClient();
  const teams = new TeamsMockClient();
  dealClients.set(deal.id, { email, teams });
  return {
    hubspot: new HubSpotMockClient([deal]),
    copilot: new CopilotMockClient(),
    invoice: new InvoiceMockClient(delayMs),
    email,
    teams,
  };
}

async function runOneDeal(deal: Deal, clients: Clients, router: CsmRouter): Promise<void> {
  let state = dealStates.get(deal.id) ?? makeInitialState(deal);

  const emit = (s: DealState) => {
    dealStates.set(deal.id, s);
    broadcast('update', { dealId: deal.id, state: s });
  };

  const STAGE_PAUSE   = 5_000;
  const RUNNING_PAUSE = 800;
  const POLL_INTERVAL = 4_000;
  const NUDGE1_MS     = 8_000;
  const NUDGE2_MS     = 20_000;
  const MAX_WAIT_MS   = 32_000;

  const log = (msg: string) => process.stdout.write(`  [${deal.id}] ${msg}\n`);

  const stageStartMs: Partial<Record<string, number>> = {};

  const preRun = async (stage: keyof DealState['stages'], label: string) => {
    stageStartMs[stage] = Date.now();
    state.stageStartedAt = state.stageStartedAt ?? {};
    (state.stageStartedAt as Record<string, string>)[stage] = new Date().toISOString();
    log(`→ Stage ${stage}: ${label} — starting…`);
    state.stages[stage] = 'running';
    emit(state);
    await sleep(RUNNING_PAUSE);
  };

  const postRun = async (stage: keyof DealState['stages'], label: string) => {
    const started = stageStartMs[stage];
    if (started) {
      state.stageDurations = state.stageDurations ?? {};
      (state.stageDurations as Record<string, number>)[stage] = Date.now() - started;
    }
    const status = state.stages[stage];
    log(`✓ Stage ${stage}: ${label} — ${status}`);
    emit(state);
    await sleep(STAGE_PAUSE);
  };

  try {
    await preRun('A', 'Invoice & Send');
    state = await runStageA(deal, state, clients);
    log(`  invoice ${state.invoiceId} · due ${state.dueDate}`);
    await postRun('A', 'Invoice & Send');

    await preRun('B', 'Nudge Schedule');
    state = await runStageB(deal, state, clients);
    log(`  nudge-1 ${state.nudge1Date} · nudge-2 ${state.nudge2Date}`);
    await postRun('B', 'Nudge Schedule');

    // ── Stage C: payment wait loop ──────────────────────────────────────────
    await preRun('C', 'Payment Detection');

    const waitStart = Date.now();
    let nudge1Sent = false;
    let nudge2Sent = false;
    let paymentReceived = false;

    while (true) {
      const elapsed = Date.now() - waitStart;

      if (!nudge1Sent && elapsed >= NUDGE1_MS) {
        await sendNudge1(deal, state, clients);
        nudge1Sent = true;
        state.nudgesSent = [...(state.nudgesSent ?? []), 'nudge1'];
        state.auditLog.push({
          timestamp: new Date().toISOString(),
          stage: 'C',
          action: 'nudge1_sent',
          data: { waitMs: elapsed, invoiceId: state.invoiceId },
        });
        log(`  nudge-1 sent (${Math.round(elapsed / 1000)}s elapsed)`);
        emit(state);
      }

      if (!nudge2Sent && elapsed >= NUDGE2_MS) {
        const newState = await sendNudge2(deal, state, clients);
        if (newState) state = newState;
        nudge2Sent = true;
        state.nudgesSent = [...(state.nudgesSent ?? []), 'nudge2'];
        log(`  nudge-2 sent + overdue flagged (${Math.round(elapsed / 1000)}s elapsed)`);
        emit(state);
      }

      if (elapsed >= MAX_WAIT_MS) {
        state.stages.C = 'pending';
        state.needsHumanFollowUp = true;
        state.paymentWaitMs = elapsed;
        log(`  payment not received after ${Math.round(elapsed / 1000)}s — needs human follow-up`);
        state.auditLog.push({
          timestamp: new Date().toISOString(),
          stage: 'C',
          action: 'flagged_needs_followup',
          data: { waitMs: elapsed, nudgesSent: state.nudgesSent ?? [] },
        });
        emit(state);
        return;
      }

      state = await runStageC(deal, state, clients);
      if (state.stages.C === 'complete') {
        paymentReceived = true;
        state.paymentWaitMs = elapsed;
        break;
      }

      state.stages.C = 'running';
      emit(state);
      await sleep(POLL_INTERVAL);
    }

    if (!paymentReceived) return;
    log(`  $${state.paymentAmount?.toLocaleString()} received at ${state.invoicePaidAt}`);
    await postRun('C', 'Payment Detection');

    await preRun('D', 'Deal Tagging');
    state = await runStageD(deal, state, clients);
    if (state.stages.D === 'failed') {
      log(`  HALT — ${state.haltReason}`);
      emit(state);
      return;
    }
    log(`  tags: ${state.tagsApplied?.join(', ')}`);
    await postRun('D', 'Deal Tagging');

    await preRun('E', 'CSM Assignment');
    state = await runStageE(deal, state, clients, router, CSMS);
    log(`  assigned: ${state.assignedCsm?.name} (${state.assignedCsm?.tier} · ${state.assignedCsm?.region})`);
    await postRun('E', 'CSM Assignment');

    await preRun('F', 'Copilot Registration');
    state = await runStageF(deal, state, clients);
    log(`  company ${state.copilotCompanyId} · sub end ${state.computedSubEndDate ?? deal.subscriptionEndDate ?? 'N/A'}`);
    await postRun('F', 'Copilot Registration');

    await preRun('G', 'Close & Notify');
    state = await runStageG(deal, state, clients, EVENTS);

    // Count Teams mutations
    const teamsClient = dealClients.get(deal.id)?.teams;
    if (teamsClient) {
      state.teamsMutationCount = teamsClient.getMutations(deal.id).length;
    }

    log(`  emails sent · Teams card closed · HubSpot → Closed Won`);
    await postRun('G', 'Close & Notify');

    log(`★ COMPLETE — ${deal.company}`);
  } catch (err) {
    console.error(`[${deal.id}] ERROR:`, err);
  }
}

async function processBulk(): Promise<void> {
  if (isBulkRunning) return;
  isBulkRunning = true;
  resetAllStates();
  broadcast('reset', {});
  await sleep(300);

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  Starting bulk run — ${DEALS.length} deals concurrent, 3s stagger`);
  console.log(`${'─'.repeat(60)}\n`);

  const router = new CsmRouter();
  const promises = DEALS.map((deal, i) =>
    sleep(i * 3_000).then(async () => {
      console.log(`\n[${deal.id}] ${deal.company.padEnd(30)} ${deal.dealType} · $${deal.invoiceAmount.toLocaleString()} [${deal.paymentBehavior}]`);
      await runOneDeal(deal, makeClients(deal), router);
      const s = dealStates.get(deal.id);
      if (s) dealReplies.set(deal.id, generateReplies(deal, s));
    }),
  );

  await Promise.all(promises);

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  Bulk run complete — ${DEALS.length} deals processed`);
  console.log(`${'─'.repeat(60)}\n`);
  broadcast('complete', { total: DEALS.length });
  isBulkRunning = false;
}

// ── Resume helpers ─────────────────────────────────────────────────────────────

function makeResumeClients(dealId: string, deal: Deal): Clients {
  const existing = dealClients.get(dealId);
  const email = existing?.email ?? new EmailMockClient();
  const teams = existing?.teams ?? new TeamsMockClient();
  if (!existing) dealClients.set(dealId, { email, teams });
  return {
    hubspot:  new HubSpotMockClient([deal]),
    copilot:  new CopilotMockClient(),
    invoice:  new InvoiceMockClient(0),
    email,
    teams,
  };
}

async function resumePipeline(deal: Deal, startingState: DealState, router: CsmRouter): Promise<void> {
  let state = startingState;
  const clients = makeResumeClients(deal.id, deal);
  const PAUSE = 4_000;
  const BOOT  = 800;
  const log = (msg: string) => process.stdout.write(`  [${deal.id}] RESUME ${msg}\n`);
  const emit = (s: DealState) => { dealStates.set(deal.id, s); broadcast('update', { dealId: deal.id, state: s }); };

  try {
    if (state.stages.D !== 'complete') {
      state.stages.D = 'running'; emit(state); await sleep(BOOT);
      state = await runStageD(deal, state, clients);
      if (state.stages.D === 'failed') { log(`HALT — ${state.haltReason}`); emit(state); return; }
      log('Stage D done'); emit(state); await sleep(PAUSE);
    }
    if (state.stages.E !== 'complete') {
      state.stages.E = 'running'; emit(state); await sleep(BOOT);
      state = await runStageE(deal, state, clients, router, CSMS);
      log(`Stage E done — ${state.assignedCsm?.name}`); emit(state); await sleep(PAUSE);
    }
    if (state.stages.F !== 'complete') {
      state.stages.F = 'running'; emit(state); await sleep(BOOT);
      state = await runStageF(deal, state, clients);
      log(`Stage F done — copilot ${state.copilotCompanyId}`); emit(state); await sleep(PAUSE);
    }
    if (state.stages.G !== 'complete') {
      state.stages.G = 'running'; emit(state); await sleep(BOOT);
      state = await runStageG(deal, state, clients, EVENTS);
      const tc = dealClients.get(deal.id)?.teams;
      if (tc) state.teamsMutationCount = tc.getMutations(deal.id).length;
      log('Stage G done — onboarded'); emit(state);
    }
    const s = dealStates.get(deal.id);
    if (s) dealReplies.set(deal.id, generateReplies(deal, s));
  } catch (err) {
    console.error(`[${deal.id}] RESUME ERROR:`, err);
  }
}

// ── Routes ─────────────────────────────────────────────────────────────────────

app.use(express.static(path.join(process.cwd(), 'public')));

app.get('/api/deals', (_req, res) => {
  const seedById = new Map(DEALS.map(d => [d.id, d]));
  res.json(
    [...dealStates.keys()].map(id => {
      const deal = seedById.get(id) ?? runtimeDeals.get(id);
      return deal ? { ...deal, state: dealStates.get(id) } : null;
    }).filter(Boolean),
  );
});

app.get('/api/deals/:id', (req, res) => {
  const { id } = req.params;
  const state = dealStates.get(id);
  if (!state) { res.status(404).json({ error: 'Deal not found' }); return; }

  const seedById = new Map(DEALS.map(d => [d.id, d]));
  const deal = seedById.get(id) ?? runtimeDeals.get(id);
  if (!deal) { res.status(404).json({ error: 'Deal not found' }); return; }

  const clients = dealClients.get(id);
  const emails: SentEmail[] = clients ? clients.email.getSentEmails() : [];
  const teamsMutations = clients ? clients.teams.getMutations(id) : [];
  const replies = dealReplies.get(id) ?? [];

  res.json({ deal, state, emails, teamsMutations, replies });
});

// Human intervention endpoint — logs to audit trail AND mutates state for known actions
app.post('/api/deals/:id/action', (req, res) => {
  const { id } = req.params;
  const { action, data } = req.body as { action: string; data?: Record<string, unknown> };
  const state = dealStates.get(id);
  if (!state) { res.status(404).json({ error: 'Deal not found' }); return; }

  // State-mutating overrides
  if (action === 'force_reassign_csm' && data?.csmName) {
    const csm = CSMS.find(c => c.name === data.csmName);
    if (csm) {
      state.assignedCsm  = csm;
      state.csmReasoning = `Manually reassigned to ${csm.name} (override)`;
    }
  }
  if (action === 'edit_tags' && Array.isArray(data?.tags)) {
    state.tagsApplied      = data.tags as string[];
    state.tagsNewlyApplied = data.tags as string[];
  }

  const entry: AuditEntry = {
    timestamp: new Date().toISOString(),
    stage: (data?.stage as string) ?? 'manual',
    action,
    data,
    manual: true,
  };
  state.auditLog.push(entry);
  dealStates.set(id, state);
  broadcast('update', { dealId: id, state });
  res.json({ ok: true, entry });
});

app.get('/api/csms', (_req, res) => {
  res.json(CSMS);
});

// Resume a halted or needs-follow-up deal from Stage D
app.post('/api/deals/:id/resume', (req, res) => {
  const { id } = req.params;
  const state = dealStates.get(id);
  if (!state) { res.status(404).json({ error: 'Deal not found' }); return; }

  const seedById = new Map(DEALS.map(d => [d.id, d]));
  const deal = seedById.get(id) ?? runtimeDeals.get(id);
  if (!deal) { res.status(404).json({ error: 'Deal not found' }); return; }

  if (!state.needsHumanFollowUp && !state.haltReason) {
    res.status(400).json({ error: 'Deal is not halted or awaiting follow-up' });
    return;
  }

  const now = new Date().toISOString();

  if (state.needsHumanFollowUp) {
    state.needsHumanFollowUp = false;
    state.stages.C     = 'complete';
    state.invoicePaidAt = now;
    state.paymentAmount = deal.invoiceAmount;
    state.auditLog.push({
      timestamp: now, stage: 'C', action: 'payment_manually_confirmed',
      data: { amount: deal.invoiceAmount, method: 'manual_override' }, manual: true,
    });
  }

  if (state.haltReason) {
    const prev = state.haltReason;
    delete state.haltReason;
    state.stages.D = 'pending';
    state.auditLog.push({
      timestamp: now, stage: 'D', action: 'halt_cleared',
      data: { previousReason: prev }, manual: true,
    });
  }

  dealStates.set(id, state);
  broadcast('update', { dealId: id, state });
  res.json({ ok: true });

  resumePipeline(deal, state, new CsmRouter()).catch(console.error);
});

const runtimeDeals = new Map<string, Deal>();

app.post('/api/deals', (req, res) => {
  const b = req.body as Partial<Deal> & { aumDollars?: string; invoiceAmount?: string };

  if (!b.company || !b.dealType || !b.primaryContact || !b.salesRepName || !b.salesRepEmail) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  const deal: Deal = {
    id: `D-${++nextDealId}`,
    company:             b.company,
    aumDollars:          Number(b.aumDollars)    || 0,
    invoiceAmount:       Number(b.invoiceAmount) || 0,
    dealType:            b.dealType,
    primaryContact:      b.primaryContact,
    events:              b.events ?? [],
    subscriptionEndDate: b.subscriptionEndDate ?? null,
    salesRepName:        b.salesRepName,
    salesRepEmail:       b.salesRepEmail,
    paymentBehavior:     'immediate',
  };

  runtimeDeals.set(deal.id, deal);
  const initialState = makeInitialState(deal);
  dealStates.set(deal.id, initialState);

  broadcast('newdeal', { deal, state: initialState });

  runOneDeal(deal, makeClients(deal), new CsmRouter())
    .then(() => {
      const s = dealStates.get(deal.id);
      if (s) dealReplies.set(deal.id, generateReplies(deal, s));
    })
    .catch(console.error);

  res.status(201).json({ dealId: deal.id });
});

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  dealStates.forEach((state, dealId) => {
    const deal = new Map(DEALS.map(d => [d.id, d])).get(dealId) ?? runtimeDeals.get(dealId);
    if (deal) res.write(`event: update\ndata: ${JSON.stringify({ dealId, state })}\n\n`);
  });

  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

app.post('/api/run', (_req, res) => {
  if (isBulkRunning) { res.status(409).json({ error: 'Already running' }); return; }
  processBulk().catch(console.error);
  res.json({ started: true });
});

app.post('/api/reset', (_req, res) => {
  if (isBulkRunning) { res.status(409).json({ error: 'Cannot reset while running' }); return; }
  runtimeDeals.clear();
  resetAllStates();
  broadcast('reset', {});
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log('\n  ══════════════════════════════════════════════');
  console.log('   iConnections Onboarding Dashboard');
  console.log(`   Open → http://localhost:${PORT}`);
  console.log('  ══════════════════════════════════════════════\n');
});
