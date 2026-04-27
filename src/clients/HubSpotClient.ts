import { Deal, IHubSpotClient } from '../types';

// ─── Mock Implementation ───────────────────────────────────────────────────────

export class HubSpotMockClient implements IHubSpotClient {
  private deals: Map<string, Deal>;
  private tags: Map<string, string[]> = new Map();
  private stages: Map<string, string> = new Map();
  private properties: Map<string, Record<string, string>> = new Map();

  constructor(seedDeals: Deal[]) {
    this.deals = new Map(seedDeals.map(d => [d.id, d]));
  }

  async getDeal(dealId: string): Promise<Deal> {
    const deal = this.deals.get(dealId);
    if (!deal) throw new Error(`HubSpot deal not found: ${dealId}`);
    return { ...deal };
  }

  async getTags(dealId: string): Promise<string[]> {
    return [...(this.tags.get(dealId) ?? [])];
  }

  async applyTags(dealId: string, tags: string[]): Promise<void> {
    const existing = this.tags.get(dealId) ?? [];
    const merged = Array.from(new Set([...existing, ...tags]));
    this.tags.set(dealId, merged);
    console.log(`  [HubSpot] Tags applied to ${dealId}: ${tags.join(', ')}`);
  }

  async setDealProperty(dealId: string, property: string, value: string): Promise<void> {
    const props = this.properties.get(dealId) ?? {};
    props[property] = value;
    this.properties.set(dealId, props);
    console.log(`  [HubSpot] ${dealId}.${property} = ${value}`);
  }

  async moveDealStage(dealId: string, stage: string): Promise<void> {
    this.stages.set(dealId, stage);
    console.log(`  [HubSpot] ${dealId} stage → ${stage}`);
  }

  async markClosedWon(dealId: string): Promise<void> {
    this.stages.set(dealId, 'closedwon');
    console.log(`  [HubSpot] ${dealId} marked Closed Won`);
  }

  // For test inspection
  getStoredTags(dealId: string): string[] {
    return [...(this.tags.get(dealId) ?? [])];
  }

  getStoredStage(dealId: string): string | undefined {
    return this.stages.get(dealId);
  }

  getStoredProperty(dealId: string, property: string): string | undefined {
    return this.properties.get(dealId)?.[property];
  }
}

// ─── Live Implementation (stub — wire up after mock validation) ────────────────

export class HubSpotLiveClient implements IHubSpotClient {
  constructor(private readonly apiKey: string, private readonly portalId: string) {}

  async getDeal(_dealId: string): Promise<Deal> {
    // TODO: GET https://api.hubapi.com/crm/v3/objects/deals/{dealId}?associations=contacts,line_items
    throw new Error('HubSpotLiveClient.getDeal: not yet wired up');
  }

  async getTags(_dealId: string): Promise<string[]> {
    // TODO: GET deal properties for tag multi-select fields
    throw new Error('HubSpotLiveClient.getTags: not yet wired up');
  }

  async applyTags(_dealId: string, _tags: string[]): Promise<void> {
    // TODO: PATCH https://api.hubapi.com/crm/v3/objects/deals/{dealId}
    throw new Error('HubSpotLiveClient.applyTags: not yet wired up');
  }

  async setDealProperty(_dealId: string, _property: string, _value: string): Promise<void> {
    // TODO: PATCH https://api.hubapi.com/crm/v3/objects/deals/{dealId}
    throw new Error('HubSpotLiveClient.setDealProperty: not yet wired up');
  }

  async moveDealStage(_dealId: string, _stage: string): Promise<void> {
    // TODO: PATCH deal with dealstage property (use internal stage ID from pipeline)
    throw new Error('HubSpotLiveClient.moveDealStage: not yet wired up');
  }

  async markClosedWon(_dealId: string): Promise<void> {
    // TODO: PATCH deal with dealstage = "closedwon" (verify pipeline stage ID in portal settings)
    throw new Error('HubSpotLiveClient.markClosedWon: not yet wired up');
  }
}
