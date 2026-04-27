import { Clients, Deal, DealState } from '../types';

const DEAL_TYPE_TAGS = ['Platform Renewal', 'New Client', 'Event Only'] as const;

function expectedTags(deal: Deal): string[] {
  const tags: string[] = [deal.dealType];
  for (const ev of deal.events) tags.push(ev);
  return tags;
}

// Stage D — Deal Tagging (HubSpot)
// Idempotent: re-running won't re-apply already-correct tags
export async function runStageD(deal: Deal, state: DealState, clients: Clients): Promise<DealState> {
  if (state.stages.D === 'complete') return state;
  if (state.stages.C !== 'complete') throw new Error('Stage D requires Stage C to be complete');
  state.stages.D = 'running';

  const existing = await clients.hubspot.getTags(deal.id);
  const expected = expectedTags(deal);

  const existingTypes = existing.filter(t =>
    DEAL_TYPE_TAGS.includes(t as typeof DEAL_TYPE_TAGS[number]),
  );
  const conflictingTypes = existingTypes.filter(t => t !== deal.dealType);
  if (conflictingTypes.length > 0) {
    state.stages.D = 'failed';
    state.haltReason = `Conflicting deal-type tags: found [${conflictingTypes.join(', ')}], expected ${deal.dealType}`;
    state.auditLog.push({
      timestamp: new Date().toISOString(),
      stage: 'D',
      action: 'halt_conflicting_tags',
      data: { conflicting: conflictingTypes, expected: deal.dealType },
    });
    console.log(`  [Stage D] HALT — ${state.haltReason}`);
    return state;
  }

  if (deal.dealType === 'Event Only' && deal.events.length === 0) {
    state.stages.D = 'failed';
    state.haltReason = 'Event Only deal has no event tags';
    console.log(`  [Stage D] HALT — ${state.haltReason}`);
    return state;
  }

  const missing = expected.filter(t => !existing.includes(t));
  if (missing.length > 0) {
    await clients.hubspot.applyTags(deal.id, missing);
  }

  const allTags = Array.from(new Set([...existing, ...expected]));
  state.tagsApplied = allTags;
  state.tagsExisting = existing;
  state.tagsNewlyApplied = missing;
  state.stages.D = 'complete';

  if (state.teamsCardId) {
    await clients.teams.patchCard(state.teamsCardId, deal, state, 'deal_tagged');
  }

  state.auditLog.push({
    timestamp: new Date().toISOString(),
    stage: 'D',
    action: 'tags_applied',
    data: { tags: allTags, existing, newlyApplied: missing },
  });

  return state;
}
