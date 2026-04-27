import { Clients, Deal, DealState } from '../types';
import { nudge1Date, nudge2Date } from '../utils/businessDays';

// Stage A — Invoice Creation & Send
// Idempotent: skips if already complete
export async function runStageA(deal: Deal, state: DealState, clients: Clients): Promise<DealState> {
  if (state.stages.A === 'complete') return state;
  state.stages.A = 'running';

  // Due date: 30 days net from today
  const due = new Date();
  due.setDate(due.getDate() + 30);
  const dueDate = due.toISOString().slice(0, 10);

  const invoice = await clients.invoice.createInvoice(deal, dueDate);
  state.invoiceId = invoice.id;
  state.dueDate = dueDate;
  state.nudge1Date = nudge1Date(due).toISOString().slice(0, 10);
  state.nudge2Date = nudge2Date(due).toISOString().slice(0, 10);

  const pdfPath = await clients.invoice.sendInvoice(invoice.id, deal);
  await clients.email.sendInvoiceEmail(deal, invoice, pdfPath);

  const sentAt = new Date().toISOString();
  state.invoiceSentAt = sentAt;
  state.invoiceStatus = 'sent';

  await clients.hubspot.moveDealStage(deal.id, 'invoiced');

  // Teams: post to Deal Won channel
  await clients.teams.postDealWon(deal);

  // Teams: create per-deal card in Onboarding Process channel (Invoice sent ✓)
  state.stages.A = 'complete';
  const cardId = await clients.teams.createOnboardingCard(deal, state);
  state.teamsCardId = cardId;

  state.auditLog.push({
    timestamp: sentAt,
    stage: 'A',
    action: 'invoice_sent',
    data: { invoiceId: invoice.id, dueDate, pdfPath, nudge1Date: state.nudge1Date, nudge2Date: state.nudge2Date },
  });

  return state;
}
