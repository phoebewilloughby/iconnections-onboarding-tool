import { Clients, Deal, DealState, EventRecord } from '../types';

// Stage G — Close Deal & Notify
// Teams card is patched AFTER both emails send successfully.
// Idempotent: skips if already complete
export async function runStageG(
  deal: Deal,
  state: DealState,
  clients: Clients,
  allEvents: EventRecord[],
): Promise<DealState> {
  if (state.stages.G === 'complete') return state;
  if (state.stages.F !== 'complete') throw new Error('Stage G requires Stage F to be complete');
  state.stages.G = 'running';

  const csm = state.assignedCsm;
  if (!csm) throw new Error('No assigned CSM on state');
  if (!state.invoiceId) throw new Error('No invoice ID on state');

  // 1. Move HubSpot deal to Closed Won
  await clients.hubspot.markClosedWon(deal.id);

  // 2. Build copilot URL for CSM notification
  const copilotUrl = `https://copilot.iconnections.io/companies/${state.copilotCompanyId}`;

  // 3. Send CSM internal notification
  const invoice = await clients.invoice.getInvoice(state.invoiceId);
  await clients.email.sendCsmNotification(deal, csm, invoice, copilotUrl);

  // 4. Send client welcome email
  const dealEvents = allEvents.filter(e => deal.events.includes(e.name));
  await clients.email.sendClientWelcome(deal, csm, dealEvents);

  // 5. Patch Teams card AFTER both emails succeed — CSM sees Teams + email at the same moment
  state.stages.G = 'complete';
  if (state.teamsCardId) {
    await clients.teams.patchCard(
      state.teamsCardId,
      deal,
      state,
      'onboarded_closed_won',
    );
  }

  state.auditLog.push({
    timestamp: new Date().toISOString(),
    stage: 'G',
    action: 'deal_closed_onboarded',
    data: { csm: csm.name, copilotUrl },
  });

  return state;
}
