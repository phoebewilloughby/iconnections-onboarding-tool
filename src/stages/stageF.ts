import { Clients, Deal, DealState } from '../types';
import { addMonths } from '../utils/businessDays';

const RENEWAL_MONTHS = 12;

// Stage F — Copilot v3 Registration
// Idempotent: findCompany / findClient before creating; skips existing event registrations
export async function runStageF(deal: Deal, state: DealState, clients: Clients): Promise<DealState> {
  if (state.stages.F === 'complete') return state;
  if (state.stages.E !== 'complete') throw new Error('Stage F requires Stage E to be complete');
  state.stages.F = 'running';

  // 1. Find or create company
  let company = await clients.copilot.findCompany(deal.company);
  if (!company) {
    company = await clients.copilot.createCompany(deal.company);
  }

  // 2. Set subscription end date (skip for Event Only)
  // Platform Renewal: extend 12 months from the existing sub end date on the deal record.
  // New Client: use the sub end date from the deal record as-is (first subscription).
  let newSubEnd: string | null = null;
  if (deal.dealType !== 'Event Only' && deal.subscriptionEndDate) {
    newSubEnd = deal.dealType === 'Platform Renewal'
      ? addMonths(new Date(deal.subscriptionEndDate), RENEWAL_MONTHS).toISOString().slice(0, 10)
      : deal.subscriptionEndDate;
    await clients.copilot.updateCompanySubEnd(company.id, newSubEnd);
    state.computedSubEndDate = newSubEnd;
  }

  // 3. Create/update client record for primary contact
  const clientRecord = await clients.copilot.createOrUpdateClient(company.id, deal.primaryContact);

  // 4. Register client for each event
  for (const eventName of deal.events) {
    await clients.copilot.registerClientForEvent(clientRecord.id, company.id, eventName);
  }

  // 5. Write Copilot IDs back to HubSpot
  state.copilotCompanyId = company.id;
  state.copilotClientIds = [clientRecord.id];
  await clients.hubspot.setDealProperty(deal.id, 'copilot_company_id', company.id);
  await clients.hubspot.setDealProperty(deal.id, 'copilot_client_ids', clientRecord.id);

  state.stages.F = 'complete';

  if (state.teamsCardId) {
    await clients.teams.patchCard(
      state.teamsCardId,
      deal,
      state,
      'copilot_registered',
    );
  }

  state.auditLog.push({
    timestamp: new Date().toISOString(),
    stage: 'F',
    action: 'copilot_registered',
    data: {
      companyId: company.id,
      clientId: clientRecord.id,
      subEndDate: newSubEnd,
      eventsRegistered: deal.events,
    },
  });

  return state;
}
