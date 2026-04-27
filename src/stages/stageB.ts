import { Clients, Deal, DealState } from '../types';

// Stage B — Nudge Schedule
// In the live system this stage sets up scheduled jobs (cron / queue) for:
//   Nudge 1: 3 business days BEFORE due date (friendly reminder)
//   Nudge 2: 2 business days AFTER due date  (firmer, cc Sales Rep)
// In the mock run, dates are already computed and stored in state by Stage A.
// Actual sending would be triggered by a scheduler reading state.nudge1Date / nudge2Date.
// We expose sendNudge1 / sendNudge2 as callable helpers for scheduler integration.
// Idempotent: skips if already complete

export async function runStageB(deal: Deal, state: DealState, clients: Clients): Promise<DealState> {
  if (state.stages.B === 'complete') return state;
  if (state.stages.A !== 'complete') throw new Error('Stage B requires Stage A to be complete');
  state.stages.B = 'running';

  const ts = new Date().toISOString();
  console.log(`  [Stage B] Nudge schedule set: Nudge-1 ${state.nudge1Date}, Nudge-2 ${state.nudge2Date}`);

  state.stages.B = 'complete';
  state.auditLog.push({
    timestamp: ts,
    stage: 'B',
    action: 'nudge_schedule_set',
    data: { nudge1Date: state.nudge1Date, nudge2Date: state.nudge2Date },
  });

  return state;
}

// Called by scheduler when nudge 1 date arrives and invoice is still unpaid
export async function sendNudge1(deal: Deal, state: DealState, clients: Clients): Promise<void> {
  if (!state.invoiceId) throw new Error('No invoice on deal state');
  const invoice = await clients.invoice.getInvoice(state.invoiceId);
  if (invoice.status === 'paid') return; // already paid, skip

  const pdfPath = invoice.pdfPath ?? '';
  await clients.email.sendNudge1(deal, invoice, pdfPath);
  console.log(`  [Stage B] Nudge 1 sent for ${deal.id}`);
}

// Called by scheduler when nudge 2 date arrives and invoice is still unpaid
export async function sendNudge2(
  deal: Deal,
  state: DealState,
  clients: Clients,
): Promise<DealState> {
  if (!state.invoiceId) throw new Error('No invoice on deal state');
  const invoice = await clients.invoice.getInvoice(state.invoiceId);
  if (invoice.status === 'paid') return state;

  await clients.invoice.markOverdue(state.invoiceId);
  state.invoiceStatus = 'overdue';
  state.needsHumanFollowUp = false; // not yet — only after nudge 2

  const pdfPath = invoice.pdfPath ?? '';
  await clients.email.sendNudge2(deal, invoice, pdfPath);

  // Teams: badge → Overdue, @mention Sales Rep
  if (state.teamsCardId) {
    await clients.teams.patchCard(
      state.teamsCardId,
      deal,
      state,
      'nudge2_overdue',
      [deal.salesRepName],
    );
  }

  // Flag for human follow-up after nudge 2 fires
  await clients.invoice.flagNeedsFollowUp(state.invoiceId);
  state.needsHumanFollowUp = true;
  state.invoiceStatus = 'needs_human_followup';

  state.auditLog.push({
    timestamp: new Date().toISOString(),
    stage: 'B',
    action: 'nudge2_sent_flagged',
    data: { salesRepMentioned: deal.salesRepName },
  });

  return state;
}
