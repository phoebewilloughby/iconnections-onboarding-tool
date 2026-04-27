import { CSM, CsmTier, Deal, Region } from '../types';

export function determineTier(deal: Deal): CsmTier {
  return deal.invoiceAmount > 25000 || deal.aumDollars > 1_000_000_000
    ? 'Enterprise'
    : 'Scale';
}

export function detectRegion(mobile: string): Region {
  const normalized = mobile.replace(/[\s\-().]/g, '');
  if (normalized.startsWith('+1')) return 'Americas';
  if (
    normalized.startsWith('+44') ||
    normalized.startsWith('+33') ||
    normalized.startsWith('+49') ||
    normalized.startsWith('+31') ||
    normalized.startsWith('+41') ||
    normalized.startsWith('+32') ||
    normalized.startsWith('+34') ||
    normalized.startsWith('+39') ||
    normalized.startsWith('+46') ||
    normalized.startsWith('+47') ||
    normalized.startsWith('+45') ||
    normalized.startsWith('+353') ||
    normalized.startsWith('+358') ||
    normalized.startsWith('+351') ||
    normalized.startsWith('+30')
  ) return 'EMEA';
  if (
    normalized.startsWith('+65') ||
    normalized.startsWith('+81') ||
    normalized.startsWith('+82') ||
    normalized.startsWith('+61') ||
    normalized.startsWith('+64') ||
    normalized.startsWith('+852') ||
    normalized.startsWith('+86')
  ) return 'APAC';
  return 'Global';
}

export class CsmRouter {
  private counters: Map<string, number> = new Map();

  assignCsm(deal: Deal, allCsms: CSM[]): { csm: CSM; reasoning: string } {
    const tier = determineTier(deal);
    const region = detectRegion(deal.primaryContact.mobile);

    const tierReason = deal.invoiceAmount > 25000
      ? `invoice $${(deal.invoiceAmount / 1000).toFixed(0)}k > $25k threshold`
      : `AUM $${(deal.aumDollars / 1e9).toFixed(2)}B > $1B threshold`;

    const pool = allCsms.filter(c => c.tier === tier && c.region === region);

    if (pool.length === 0) {
      throw new Error(
        `No ${tier} CSM configured for region ${region} — add one before going live`,
      );
    }

    const key = `${tier}:${region}`;
    const idx = (this.counters.get(key) ?? 0) % pool.length;
    this.counters.set(key, idx + 1);
    const csm = pool[idx];

    const reasoning = `Tier=${tier} (${tierReason}); Region=${region} (mobile ${deal.primaryContact.mobile}); pool=${pool.length} CSM${pool.length !== 1 ? 's' : ''}; round-robin slot ${idx + 1}/${pool.length} → ${csm.name}`;

    return { csm, reasoning };
  }
}
