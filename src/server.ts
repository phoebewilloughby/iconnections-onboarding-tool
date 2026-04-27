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
import type { ClientReply } from './types';
import { Clients, Deal, DealState } from './types';
import { CsmRouter } from './utils/csmRouting';
import { DEALS, CSMS, EVENTS } from '../test/fixtures/deals';
import { runStageA } from './stages/stageA';
import { runStageB } from './stages/stageB';
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
let nextDealId = 2000;

// Per-deal client refs kept alive so detail view can read emails + Teams mutations
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

function resetAllStates(): void {
  dealStates = new Map(DEALS.map(d => [d.id, makeInitialState(d)]));
  dealClients.clear();
  dealReplies.clear();
}

resetAllStates();

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ── Pipeline helpers ───────────────────────────────────────────────────────────

function makeClients(deal: Deal): Clients {
  const email = new EmailMockClient();
  const teams = new TeamsMockClient();
  dealClients.set(deal.id, { email, teams });
  return {
    hubspot: new HubSpotMockClient([deal]),
    copilot: new CopilotMockClient(),
    invoice: new InvoiceMockClient(),
    email,
    teams,
  };
}

async function runOneDeal(
  deal: Deal,
  clients: Clients,
  router: CsmRouter,
): Promise<void> {
  let state = dealStates.get(deal.id) ?? makeInitialState(deal);

  const emit = (s: DealState) => {
    dealStates.set(deal.id, s);
    broadcast('update', { dealId: deal.id, state: s });
  };

  const STAGE_PAUSE   = 5_000;  // ms between stages
  const RUNNING_PAUSE = 800;    // ms showing "running" state before stage executes

  const log = (msg: string) => process.stdout.write(`  [${deal.id}] ${msg}\n`);

  const preRun = async (stage: keyof DealState['stages'], label: string) => {
    log(`→ Stage ${stage}: ${label} — starting…`);
    state.stages[stage] = 'running';
    emit(state);
    await sleep(RUNNING_PAUSE);
  };

  const postRun = async (stage: keyof DealState['stages'], label: string) => {
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

    await preRun('C', 'Payment Detection');
    state = await runStageC(deal, state, clients);
    if (state.stages.C !== 'complete') {
      log(`  payment not yet received — pipeline paused`);
      emit(state);
      return;
    }
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
  console.log(`  Starting bulk run — ${DEALS.length} deals`);
  console.log(`  5 s per stage · 3 s between deals`);
  console.log(`${'─'.repeat(60)}\n`);

  const router = new CsmRouter();
  for (const deal of DEALS) {
    console.log(`\n[${deal.id}] ${deal.company.padEnd(30)} ${deal.dealType} · $${deal.invoiceAmount.toLocaleString()}`);
    await runOneDeal(deal, makeClients(deal), router);
    const state = dealStates.get(deal.id);
    if (state) dealReplies.set(deal.id, generateReplies(deal, state));
    await sleep(3_000);
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  Bulk run complete — ${DEALS.length} deals processed`);
  console.log(`${'─'.repeat(60)}\n`);
  broadcast('complete', { total: DEALS.length });
  isBulkRunning = false;
}

// ── Routes ─────────────────────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, '..', 'public')));

// All deals + their current state (for initial page load)
app.get('/api/deals', (_req, res) => {
  const all = [...dealStates.entries()].map(([id, state]) => {
    // Find deal in seed data or in any submitted deals store
    return { id, state };
  });
  // Return seed deals merged with any runtime-submitted deals
  const seedById = new Map(DEALS.map(d => [d.id, d]));
  res.json(
    [...dealStates.keys()].map(id => {
      const deal = seedById.get(id) ?? runtimeDeals.get(id);
      return deal ? { ...deal, state: dealStates.get(id) } : null;
    }).filter(Boolean),
  );
});

// Deal detail: state + emails + Teams mutations
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

// Submit a new deal (from the sales form)
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
    aumDollars:          Number(b.aumDollars)     || 0,
    invoiceAmount:       Number(b.invoiceAmount)  || 0,
    dealType:            b.dealType,
    primaryContact:      b.primaryContact,
    events:              b.events ?? [],
    subscriptionEndDate: b.subscriptionEndDate ?? null,
    salesRepName:        b.salesRepName,
    salesRepEmail:       b.salesRepEmail,
  };

  runtimeDeals.set(deal.id, deal);
  const initialState = makeInitialState(deal);
  dealStates.set(deal.id, initialState);

  // Tell every open browser tab about the new deal card before pipeline starts
  broadcast('newdeal', { deal, state: initialState });

  // Process in background — no locking, independent client set
  runOneDeal(deal, makeClients(deal), new CsmRouter())
    .then(() => {
      const s = dealStates.get(deal.id);
      if (s) dealReplies.set(deal.id, generateReplies(deal, s));
    })
    .catch(console.error);

  res.status(201).json({ dealId: deal.id });
});

// SSE stream
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Replay current state to late-joining clients
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
