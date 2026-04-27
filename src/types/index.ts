export type DealType = 'Platform Renewal' | 'New Client' | 'Event Only';
export type CsmTier = 'Enterprise' | 'Scale';
export type Region = 'Americas' | 'EMEA' | 'APAC' | 'Global';
export type InvoiceStatus = 'pending' | 'sent' | 'paid' | 'overdue' | 'needs_human_followup';
export type StageStatus = 'pending' | 'running' | 'complete' | 'failed' | 'skipped';
export type PaymentBehavior = 'immediate' | 'after_nudge1' | 'after_nudge2' | 'needs_followup';

export interface Contact {
  name: string;
  email: string;
  mobile: string;
}

export interface EventRecord {
  name: string;
  date: string;
  location: string;
}

export interface CSM {
  name: string;
  tier: CsmTier;
  email: string;
  region: Region;
}

export interface Deal {
  id: string;
  company: string;
  aumDollars: number;
  invoiceAmount: number;
  dealType: DealType;
  primaryContact: Contact;
  events: string[];
  subscriptionEndDate: string | null;
  salesRepName: string;
  salesRepEmail: string;
  paymentBehavior?: PaymentBehavior;
}

export interface Invoice {
  id: string;
  dealId: string;
  amount: number;
  status: InvoiceStatus;
  dueDate: string;
  sentAt?: string;
  paidAt?: string;
  pdfPath?: string;
  nudge1SentAt?: string;
  nudge2SentAt?: string;
  needsHumanFollowUp?: boolean;
}

export interface CopilotCompany {
  id: string;
  name: string;
  subscriptionEndDate?: string;
  clientIds: string[];
  eventRegistrations: Array<{ clientId: string; eventName: string }>;
}

export interface CopilotClientRecord {
  id: string;
  companyId: string;
  name: string;
  email: string;
  mobile: string;
}

export interface DealState {
  dealId: string;
  company: string;
  stages: Record<'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G', StageStatus>;
  invoiceId?: string;
  invoiceStatus?: InvoiceStatus;
  invoiceSentAt?: string;
  invoicePaidAt?: string;
  paymentAmount?: number;
  dueDate?: string;
  nudge1Date?: string;
  nudge2Date?: string;
  nudgesSent?: ('nudge1' | 'nudge2')[];
  tagsApplied?: string[];
  tagsExisting?: string[];
  tagsNewlyApplied?: string[];
  assignedCsm?: CSM;
  csmReasoning?: string;
  copilotCompanyId?: string;
  copilotClientIds?: string[];
  computedSubEndDate?: string;
  teamsCardId?: string;
  teamsMutationCount?: number;
  needsHumanFollowUp?: boolean;
  haltReason?: string;
  stageDurations?: Partial<Record<'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G', number>>;
  stageStartedAt?: Partial<Record<'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G', string>>;
  paymentWaitMs?: number;
  auditLog: AuditEntry[];
}

export interface ClientReply {
  id: string;
  dealId: string;
  timestamp: string;
  fromName: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  body: string;
  stage: string;
}

export interface AuditEntry {
  timestamp: string;
  stage: string;
  action: string;
  data?: Record<string, unknown>;
  manual?: boolean;
}

export interface TeamsCardMutation {
  timestamp: string;
  type: 'create' | 'patch';
  dealId: string;
  patchReason?: string;
  cardState: TeamsCardState;
}

export interface TeamsCardState {
  headerCompany: string;
  headerDealId: string;
  headerStage: string;
  headerBadge?: string;
  invoiceSentChecked: boolean;
  invoiceSentTimestamp?: string;
  paymentReceivedChecked: boolean;
  paymentReceivedTimestamp?: string;
  paymentAmount?: number;
  dealTaggedChecked: boolean;
  dealTaggedTimestamp?: string;
  dealTaggedTags?: string[];
  csmAssignedChecked: boolean;
  csmAssignedTimestamp?: string;
  csmAssignedName?: string;
  copilotRegisteredChecked: boolean;
  copilotRegisteredTimestamp?: string;
  copilotRegisteredClients?: number;
  copilotRegisteredEvents?: number;
  onboardedChecked: boolean;
  onboardedTimestamp?: string;
  footerCsm?: string;
  footerInvoiceAmount?: number;
  footerEvents?: string[];
  footerSubEnd?: string;
  mentions?: string[];
}

export interface Clients {
  hubspot: IHubSpotClient;
  copilot: ICopilotClient;
  invoice: IInvoiceClient;
  email: IEmailClient;
  teams: ITeamsClient;
}

export interface IHubSpotClient {
  getDeal(dealId: string): Promise<Deal>;
  getTags(dealId: string): Promise<string[]>;
  applyTags(dealId: string, tags: string[]): Promise<void>;
  setDealProperty(dealId: string, property: string, value: string): Promise<void>;
  moveDealStage(dealId: string, stage: string): Promise<void>;
  markClosedWon(dealId: string): Promise<void>;
}

export interface ICopilotClient {
  findCompany(name: string): Promise<CopilotCompany | null>;
  createCompany(name: string): Promise<CopilotCompany>;
  updateCompanySubEnd(companyId: string, subEndDate: string): Promise<void>;
  findClient(email: string): Promise<CopilotClientRecord | null>;
  createOrUpdateClient(companyId: string, contact: Contact): Promise<CopilotClientRecord>;
  registerClientForEvent(clientId: string, companyId: string, eventName: string): Promise<void>;
}

export interface IInvoiceClient {
  createInvoice(deal: Deal, dueDate: string): Promise<Invoice>;
  sendInvoice(invoiceId: string, deal: Deal): Promise<string>;
  pollForPayment(invoiceId: string): Promise<{ paid: boolean; paidAt?: string; amount?: number }>;
  getInvoice(invoiceId: string): Promise<Invoice>;
  markOverdue(invoiceId: string): Promise<void>;
  flagNeedsFollowUp(invoiceId: string): Promise<void>;
}

export interface IEmailClient {
  sendInvoiceEmail(deal: Deal, invoice: Invoice, pdfPath: string): Promise<void>;
  sendNudge1(deal: Deal, invoice: Invoice, pdfPath: string): Promise<void>;
  sendNudge2(deal: Deal, invoice: Invoice, pdfPath: string): Promise<void>;
  sendCsmNotification(deal: Deal, csm: CSM, invoice: Invoice, copilotUrl: string): Promise<void>;
  sendClientWelcome(deal: Deal, csm: CSM, events: EventRecord[]): Promise<void>;
}

export interface ITeamsClient {
  postDealWon(deal: Deal): Promise<void>;
  createOnboardingCard(deal: Deal, state: DealState): Promise<string>;
  patchCard(cardId: string, deal: Deal, state: DealState, reason: string, mentions?: string[]): Promise<void>;
}
