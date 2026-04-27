import { Clients, CSM, Deal, DealState } from '../types';
import { CsmRouter } from '../utils/csmRouting';

// Stage E — CSM Assignment
// Idempotent: skips if CSM already assigned and written to HubSpot
export async function runStageE(
  deal: Deal,
  state: DealState,
  clients: Clients,
  router: CsmRouter,
  allCsms: CSM[],
): Promise<DealState> {
  if (state.stages.E === 'complete') return state;
  if (state.stages.D !== 'complete') throw new Error('Stage E requires Stage D to be complete');
  state.stages.E = 'running';

  const csm = router.assignCsm(deal, allCsms);
  state.assignedCsm = csm;

  await clients.hubspot.setDealProperty(deal.id, 'assigned_csm_name', csm.name);
  await clients.hubspot.setDealProperty(deal.id, 'assigned_csm_email', csm.email);

  state.stages.E = 'complete';

  if (state.teamsCardId) {
    // @mention the assigned CSM so they're notified before the client welcome email lands
    await clients.teams.patchCard(
      state.teamsCardId,
      deal,
      state,
      'csm_assigned',
      [csm.name],
    );
  }

  state.auditLog.push({
    timestamp: new Date().toISOString(),
    stage: 'E',
    action: 'csm_assigned',
    data: { csm: csm.name, tier: csm.tier, region: csm.region },
  });

  return state;
}
