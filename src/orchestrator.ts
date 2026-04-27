import fs from 'fs';
import path from 'path';
import { Clients, CSM, Deal, DealState, EventRecord } from './types';
import { CsmRouter } from './utils/csmRouting';
import { runStageA } from './stages/stageA';
import { runStageB } from './stages/stageB';
import { runStageC } from './stages/stageC';
import { runStageD } from './stages/stageD';
import { runStageE } from './stages/stageE';
import { runStageF } from './stages/stageF';
import { runStageG } from './stages/stageG';

const RUNS_DIR = path.join(process.cwd(), 'runs');

function initialState(deal: Deal): DealState {
  return {
    dealId: deal.id,
    company: deal.company,
    stages: { A: 'pending', B: 'pending', C: 'pending', D: 'pending', E: 'pending', F: 'pending', G: 'pending' },
    auditLog: [],
  };
}

function saveAudit(state: DealState): void {
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  const filePath = path.join(RUNS_DIR, `${state.dealId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}

export async function runDeal(
  deal: Deal,
  clients: Clients,
  router: CsmRouter,
  allCsms: CSM[],
  allEvents: EventRecord[],
  existingState?: DealState,
): Promise<DealState> {
  let state = existingState ?? initialState(deal);

  try {
    state = await runStageA(deal, state, clients);
    saveAudit(state);

    state = await runStageB(deal, state, clients);
    saveAudit(state);

    state = await runStageC(deal, state, clients);
    saveAudit(state);

    if (state.stages.C !== 'complete') {
      console.log(`  [Orchestrator] Stage C pending for ${deal.id} — payment not yet received`);
      return state;
    }

    state = await runStageD(deal, state, clients);
    saveAudit(state);

    if (state.stages.D === 'failed') {
      console.log(`  [Orchestrator] Halted at Stage D for ${deal.id}: ${state.haltReason}`);
      return state;
    }

    state = await runStageE(deal, state, clients, router, allCsms);
    saveAudit(state);

    state = await runStageF(deal, state, clients);
    saveAudit(state);

    state = await runStageG(deal, state, clients, allEvents);
    saveAudit(state);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    state.auditLog.push({ timestamp: new Date().toISOString(), stage: 'error', action: msg });
    saveAudit(state);
    console.error(`  [Orchestrator] ERROR for ${deal.id}: ${msg}`);
  }

  return state;
}

export function printSummary(deal: Deal, state: DealState): void {
  const ok = state.stages.G === 'complete';
  const invoiceLine = state.invoiceStatus === 'paid'
    ? `$${deal.invoiceAmount.toLocaleString()}  sent -> paid`
    : `$${deal.invoiceAmount.toLocaleString()}  ${state.invoiceStatus ?? 'pending'}`;

  const tags = state.tagsApplied?.join(' + ') ?? '—';
  const csm = state.assignedCsm
    ? `${state.assignedCsm.name} (${state.assignedCsm.tier} / ${state.assignedCsm.region})`
    : '—';

  const copilotClients = state.copilotClientIds?.length ?? 0;
  const copilotEvents = deal.events.length;
  const subEnd = state.computedSubEndDate ?? deal.subscriptionEndDate ?? 'N/A (Event Only)';

  const mutations = state.teamsCardId ? countMutations(state) : 0;
  const csmMentionNote = state.assignedCsm ? `, incl. @${state.assignedCsm.name.split(' ')[0]} on CSM assigned` : '';

  console.log(`\n[${deal.id}] ${deal.company}`);
  console.log(`  invoice     ${invoiceLine}`);
  console.log(`  tags        ${tags}`);
  console.log(`  CSM         ${csm}`);
  if (state.stages.F === 'complete') {
    console.log(`  copilot     company registered, ${copilotClients} client, ${copilotEvents} events, sub -> ${subEnd}`);
  }
  if (state.stages.G === 'complete') {
    console.log(`  emails      CSM notified, client welcomed`);
    console.log(`  teams       Deal Won posted; card ${mutations} mutations (1 create + ${mutations - 1} patches${csmMentionNote})`);
    console.log(`  deal        Closed Won  ✓`);
  } else {
    const halted = state.haltReason ? ` (${state.haltReason})` : '';
    console.log(`  deal        INCOMPLETE${halted}`);
  }
}

function countMutations(state: DealState): number {
  // create(1) + payment(C) + tags(D) + csm(E) + copilot(F) + onboarded(G) = 6 minimum
  let count = 1; // create
  if (state.stages.C === 'complete') count++;
  if (state.stages.D === 'complete') count++;
  if (state.stages.E === 'complete') count++;
  if (state.stages.F === 'complete') count++;
  if (state.stages.G === 'complete') count++;
  if (state.needsHumanFollowUp) count++; // nudge 2 overdue patch
  return count;
}
