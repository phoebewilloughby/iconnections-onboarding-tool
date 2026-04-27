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
    normalized.startsWith('+44') ||  // UK
    normalized.startsWith('+33') ||  // France
    normalized.startsWith('+49') ||  // Germany
    normalized.startsWith('+31') ||  // Netherlands
    normalized.startsWith('+41') ||  // Switzerland
    normalized.startsWith('+32') ||  // Belgium
    normalized.startsWith('+34') ||  // Spain
    normalized.startsWith('+39') ||  // Italy
    normalized.startsWith('+46') ||  // Sweden
    normalized.startsWith('+47') ||  // Norway
    normalized.startsWith('+45') ||  // Denmark
    normalized.startsWith('+353') || // Ireland
    normalized.startsWith('+358') || // Finland
    normalized.startsWith('+351') || // Portugal
    normalized.startsWith('+30')     // Greece
  ) return 'EMEA';
  if (
    normalized.startsWith('+65') ||  // Singapore
    normalized.startsWith('+81') ||  // Japan
    normalized.startsWith('+82') ||  // South Korea
    normalized.startsWith('+61') ||  // Australia
    normalized.startsWith('+64') ||  // New Zealand
    normalized.startsWith('+852') || // Hong Kong
    normalized.startsWith('+86')     // China
  ) return 'APAC';
  return 'Global';
}

export class CsmRouter {
  private counters: Map<string, number> = new Map();

  assignCsm(deal: Deal, allCsms: CSM[]): CSM {
    const tier = determineTier(deal);
    const region = detectRegion(deal.primaryContact.mobile);

    // Strictly regional: only match CSMs whose region equals the detected region exactly.
    // Unknown country codes resolve to 'Global' and match only Global-region CSMs.
    const pool = allCsms.filter(c => c.tier === tier && c.region === region);

    if (pool.length === 0) {
      throw new Error(
        `No ${tier} CSM configured for region ${region} — add one before going live`,
      );
    }

    const key = `${tier}:${region}`;
    const idx = (this.counters.get(key) ?? 0) % pool.length;
    this.counters.set(key, idx + 1);
    return pool[idx];
  }
}
