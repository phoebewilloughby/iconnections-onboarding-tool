import fs from 'fs';
import path from 'path';
import { CSM, Deal, EventRecord, IEmailClient, Invoice } from '../types';

const EMAILS_DIR = path.join(process.cwd(), 'runs', 'emails');
import {
  renderCsmNotificationHtml,
  renderCsmNotificationText,
  renderClientWelcomeHtml,
  renderClientWelcomeText,
  renderInvoiceEmailHtml,
  renderInvoiceEmailText,
  renderNudge1Html,
  renderNudge1Text,
  renderNudge2Html,
  renderNudge2Text,
} from '../utils/templates';

function logEmail(opts: {
  to: string;
  cc?: string;
  subject: string;
  bodyText: string;
}): void {
  console.log(`  [Email] → ${opts.to}${opts.cc ? ` (cc: ${opts.cc})` : ''}`);
  console.log(`         Subject: ${opts.subject}`);
}

export interface SentEmail {
  type: 'invoice' | 'nudge1' | 'nudge2' | 'csm_notification' | 'client_welcome';
  to: string;
  cc?: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  timestamp: string;
}

// ─── Mock Implementation ───────────────────────────────────────────────────────

export class EmailMockClient implements IEmailClient {
  private sent: SentEmail[] = [];

  async sendInvoiceEmail(deal: Deal, invoice: Invoice, _pdfPath: string): Promise<void> {
    const subject = `Invoice ${invoice.id} from iConnections — ${deal.company}`;
    const bodyText = renderInvoiceEmailText(deal, invoice);
    const bodyHtml = renderInvoiceEmailHtml(deal, invoice);
    const ts = new Date().toISOString();
    logEmail({ to: deal.primaryContact.email, cc: deal.salesRepEmail, subject, bodyText });
    this.sent.push({ type: 'invoice', to: deal.primaryContact.email, cc: deal.salesRepEmail, subject, bodyText, bodyHtml, timestamp: ts });
    this._writeToDisk(deal.id, 'invoice', subject, bodyHtml, bodyText);
  }

  async sendNudge1(deal: Deal, invoice: Invoice, _pdfPath: string): Promise<void> {
    const subject = `Friendly reminder: invoice ${invoice.id} due ${invoice.dueDate}`;
    const bodyText = renderNudge1Text(deal, invoice);
    const bodyHtml = renderNudge1Html(deal, invoice);
    const ts = new Date().toISOString();
    logEmail({ to: deal.primaryContact.email, subject, bodyText });
    this.sent.push({ type: 'nudge1', to: deal.primaryContact.email, subject, bodyText, bodyHtml, timestamp: ts });
    this._writeToDisk(deal.id, 'nudge1', subject, bodyHtml, bodyText);
  }

  async sendNudge2(deal: Deal, invoice: Invoice, _pdfPath: string): Promise<void> {
    const subject = `Invoice ${invoice.id} now past due — please confirm payment status`;
    const bodyText = renderNudge2Text(deal, invoice);
    const bodyHtml = renderNudge2Html(deal, invoice);
    const ts = new Date().toISOString();
    logEmail({ to: deal.primaryContact.email, cc: deal.salesRepEmail, subject, bodyText });
    this.sent.push({ type: 'nudge2', to: deal.primaryContact.email, cc: deal.salesRepEmail, subject, bodyText, bodyHtml, timestamp: ts });
    this._writeToDisk(deal.id, 'nudge2', subject, bodyHtml, bodyText);
  }

  async sendCsmNotification(deal: Deal, csm: CSM, invoice: Invoice, copilotUrl: string): Promise<void> {
    const subject = `[New Onboarding] ${deal.company} — assigned to you`;
    const bodyText = renderCsmNotificationText(deal, csm, invoice, copilotUrl);
    const bodyHtml = renderCsmNotificationHtml(deal, csm, invoice, copilotUrl);
    const ts = new Date().toISOString();
    logEmail({ to: csm.email, subject, bodyText });
    this.sent.push({ type: 'csm_notification', to: csm.email, subject, bodyText, bodyHtml, timestamp: ts });
    this._writeToDisk(deal.id, 'csm_notification', subject, bodyHtml, bodyText);
  }

  async sendClientWelcome(deal: Deal, csm: CSM, events: EventRecord[]): Promise<void> {
    const subject = `Welcome to iConnections, ${deal.company}!`;
    const bodyText = renderClientWelcomeText(deal, csm, events);
    const bodyHtml = renderClientWelcomeHtml(deal, csm, events);
    const ts = new Date().toISOString();
    logEmail({ to: deal.primaryContact.email, cc: csm.email, subject, bodyText });
    this.sent.push({ type: 'client_welcome', to: deal.primaryContact.email, cc: csm.email, subject, bodyText, bodyHtml, timestamp: ts });
    this._writeToDisk(deal.id, 'client_welcome', subject, bodyHtml, bodyText);
  }

  getSentEmails(): SentEmail[] {
    return [...this.sent];
  }

  private _writeToDisk(dealId: string, type: string, subject: string, html: string, text: string): void {
    try {
      const dir = path.join(EMAILS_DIR, dealId);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${type}.html`), html);
      fs.writeFileSync(path.join(dir, `${type}.txt`), `Subject: ${subject}\n\n${text}`);
    } catch { /* non-fatal */ }
  }
}

// ─── Live Implementation (stub) ────────────────────────────────────────────────

export class EmailLiveClient implements IEmailClient {
  constructor(
    private readonly smtpHost: string,
    private readonly smtpPort: number,
    private readonly fromAddress: string,
  ) {}

  async sendInvoiceEmail(deal: Deal, invoice: Invoice, pdfPath: string): Promise<void> {
    // TODO: Send via SMTP/SendGrid with pdfPath as attachment
    // HTML: renderInvoiceEmailHtml(deal, invoice)
    // Text: renderInvoiceEmailText(deal, invoice)
    void deal; void invoice; void pdfPath;
    throw new Error('EmailLiveClient.sendInvoiceEmail: not yet wired up');
  }

  async sendNudge1(deal: Deal, invoice: Invoice, pdfPath: string): Promise<void> {
    // TODO: Send via SMTP/SendGrid with pdfPath re-attached
    // HTML: renderNudge1Html(deal, invoice)
    // Text: renderNudge1Text(deal, invoice)
    void deal; void invoice; void pdfPath;
    throw new Error('EmailLiveClient.sendNudge1: not yet wired up');
  }

  async sendNudge2(deal: Deal, invoice: Invoice, pdfPath: string): Promise<void> {
    // TODO: Send via SMTP/SendGrid; cc deal.salesRepEmail
    // HTML: renderNudge2Html(deal, invoice)
    // Text: renderNudge2Text(deal, invoice)
    void deal; void invoice; void pdfPath;
    throw new Error('EmailLiveClient.sendNudge2: not yet wired up');
  }

  async sendCsmNotification(deal: Deal, csm: CSM, invoice: Invoice, copilotUrl: string): Promise<void> {
    // TODO: Send internal notification to csm.email
    // HTML: renderCsmNotificationHtml(deal, csm, invoice, copilotUrl)
    // Text: renderCsmNotificationText(deal, csm, invoice, copilotUrl)
    void deal; void csm; void invoice; void copilotUrl;
    throw new Error('EmailLiveClient.sendCsmNotification: not yet wired up');
  }

  async sendClientWelcome(deal: Deal, csm: CSM, events: EventRecord[]): Promise<void> {
    // TODO: Send to deal.primaryContact.email; cc csm.email
    // HTML: renderClientWelcomeHtml(deal, csm, events)
    // Text: renderClientWelcomeText(deal, csm, events)
    void deal; void csm; void events;
    throw new Error('EmailLiveClient.sendClientWelcome: not yet wired up');
  }
}

// Re-export renderers so tests can verify template output without a client instance
export {
  renderInvoiceEmailHtml,
  renderInvoiceEmailText,
  renderNudge1Html,
  renderNudge1Text,
  renderNudge2Html,
  renderNudge2Text,
  renderCsmNotificationHtml,
  renderCsmNotificationText,
  renderClientWelcomeHtml,
  renderClientWelcomeText,
};
