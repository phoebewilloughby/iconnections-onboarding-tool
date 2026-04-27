import { Contact, CopilotClientRecord, CopilotCompany, ICopilotClient } from '../types';

// ─── Mock Implementation ───────────────────────────────────────────────────────

let _companyIdSeq = 1;
let _clientIdSeq = 1;

export class CopilotMockClient implements ICopilotClient {
  private companies: Map<string, CopilotCompany> = new Map(); // keyed by id
  private companiesByName: Map<string, string> = new Map();   // name → id
  private clients: Map<string, CopilotClientRecord> = new Map(); // keyed by id
  private clientsByEmail: Map<string, string> = new Map();     // email → id

  async findCompany(name: string): Promise<CopilotCompany | null> {
    const id = this.companiesByName.get(name.toLowerCase());
    return id ? { ...(this.companies.get(id) as CopilotCompany) } : null;
  }

  async createCompany(name: string): Promise<CopilotCompany> {
    const id = `CPCO-${String(_companyIdSeq++).padStart(4, '0')}`;
    const company: CopilotCompany = { id, name, clientIds: [], eventRegistrations: [] };
    this.companies.set(id, company);
    this.companiesByName.set(name.toLowerCase(), id);
    console.log(`  [Copilot] Company created: ${name} (${id})`);
    return { ...company };
  }

  async updateCompanySubEnd(companyId: string, subEndDate: string): Promise<void> {
    const company = this.companies.get(companyId);
    if (!company) throw new Error(`Copilot company not found: ${companyId}`);
    company.subscriptionEndDate = subEndDate;
    console.log(`  [Copilot] ${companyId} subscription_end → ${subEndDate}`);
  }

  async findClient(email: string): Promise<CopilotClientRecord | null> {
    const id = this.clientsByEmail.get(email.toLowerCase());
    return id ? { ...(this.clients.get(id) as CopilotClientRecord) } : null;
  }

  async createOrUpdateClient(companyId: string, contact: Contact): Promise<CopilotClientRecord> {
    const existingId = this.clientsByEmail.get(contact.email.toLowerCase());
    if (existingId) {
      const existing = this.clients.get(existingId) as CopilotClientRecord;
      existing.name = contact.name;
      existing.mobile = contact.mobile;
      console.log(`  [Copilot] Client updated: ${contact.email} (${existingId})`);
      return { ...existing };
    }
    const id = `CPCL-${String(_clientIdSeq++).padStart(4, '0')}`;
    const record: CopilotClientRecord = { id, companyId, ...contact };
    this.clients.set(id, record);
    this.clientsByEmail.set(contact.email.toLowerCase(), id);

    const company = this.companies.get(companyId);
    if (company && !company.clientIds.includes(id)) company.clientIds.push(id);

    console.log(`  [Copilot] Client created: ${contact.name} (${id})`);
    return { ...record };
  }

  async registerClientForEvent(clientId: string, companyId: string, eventName: string): Promise<void> {
    const company = this.companies.get(companyId);
    if (!company) throw new Error(`Copilot company not found: ${companyId}`);
    const alreadyRegistered = company.eventRegistrations.some(
      r => r.clientId === clientId && r.eventName === eventName,
    );
    if (!alreadyRegistered) {
      company.eventRegistrations.push({ clientId, eventName });
      console.log(`  [Copilot] Registered ${clientId} for "${eventName}"`);
    }
  }

  getCompany(id: string): CopilotCompany | undefined {
    return this.companies.get(id);
  }
}

// ─── Live Implementation (stub) ────────────────────────────────────────────────

export class CopilotLiveClient implements ICopilotClient {
  constructor(private readonly baseUrl: string, private readonly apiKey: string) {}

  async findCompany(_name: string): Promise<CopilotCompany | null> {
    // TODO: GET {baseUrl}/api/v3/companies?search={name}
    throw new Error('CopilotLiveClient.findCompany: not yet wired up');
  }

  async createCompany(_name: string): Promise<CopilotCompany> {
    // TODO: POST {baseUrl}/api/v3/companies  { name }
    throw new Error('CopilotLiveClient.createCompany: not yet wired up');
  }

  async updateCompanySubEnd(_companyId: string, _subEndDate: string): Promise<void> {
    // TODO: PATCH {baseUrl}/api/v3/companies/{companyId}  { subscription_end_date }
    throw new Error('CopilotLiveClient.updateCompanySubEnd: not yet wired up');
  }

  async findClient(_email: string): Promise<CopilotClientRecord | null> {
    // TODO: GET {baseUrl}/api/v3/clients?email={email}
    throw new Error('CopilotLiveClient.findClient: not yet wired up');
  }

  async createOrUpdateClient(_companyId: string, _contact: Contact): Promise<CopilotClientRecord> {
    // TODO: POST/PATCH {baseUrl}/api/v3/clients
    throw new Error('CopilotLiveClient.createOrUpdateClient: not yet wired up');
  }

  async registerClientForEvent(_clientId: string, _companyId: string, _eventName: string): Promise<void> {
    // TODO: POST {baseUrl}/api/v3/event-registrations  { client_id, event_name }
    throw new Error('CopilotLiveClient.registerClientForEvent: not yet wired up');
  }
}
