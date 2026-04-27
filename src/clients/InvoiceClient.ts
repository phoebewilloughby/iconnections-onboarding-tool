import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { Deal, IInvoiceClient, Invoice, InvoiceStatus } from '../types';

const BRAND_PURPLE = '#6A2B7E';
const RUNS_DIR = path.join(process.cwd(), 'runs', 'invoices');

function dollars(n: number): string {
  return '$' + n.toLocaleString('en-US');
}

function generateInvoiceId(dealId: string): string {
  return `INV-${dealId}-${Date.now()}`;
}

function buildPdf(invoice: Invoice, deal: Deal): Promise<string> {
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  const filePath = path.join(RUNS_DIR, `${invoice.id}.pdf`);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 72 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    doc.rect(0, 0, doc.page.width, 80).fill(BRAND_PURPLE);
    doc.fillColor('white').fontSize(22).font('Helvetica-Bold').text('iConnections', 72, 28);

    doc.moveDown(2).fillColor(BRAND_PURPLE).fontSize(18).font('Helvetica-Bold').text('INVOICE');
    doc.fillColor('#1A1A1A').fontSize(11).font('Helvetica');

    doc.moveDown(0.5);
    doc.text(`Invoice Number: ${invoice.id}`);
    doc.text(`Date Issued: ${new Date().toISOString().slice(0, 10)}`);
    doc.text(`Due Date: ${invoice.dueDate}`);
    doc.text(`Bill To: ${deal.company}`);
    doc.text(`Contact: ${deal.primaryContact.name} <${deal.primaryContact.email}>`);

    doc.moveDown(1);
    doc.fillColor(BRAND_PURPLE).font('Helvetica-Bold').text('Line Items');
    doc.fillColor('#1A1A1A').font('Helvetica');
    doc.moveDown(0.3);

    if (deal.dealType !== 'Event Only') {
      doc.text(`Platform Subscription (${deal.dealType})    ${dollars(deal.invoiceAmount - deal.events.length * 2500)}`);
    }
    for (const ev of deal.events) {
      doc.text(`Event: ${ev}    ${dollars(2500)}`);
    }

    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text(`Total Due: ${dollars(invoice.amount)}`);

    doc.addPage();
    doc.rect(0, 0, doc.page.width, 80).fill(BRAND_PURPLE);
    doc.fillColor('white').fontSize(16).font('Helvetica-Bold').text('Wire Instructions', 72, 28);

    doc.moveDown(2).fillColor('#1A1A1A').font('Helvetica').fontSize(11);
    doc.text('Bank: First National Bank of New York');
    doc.text('ABA Routing: 021000021');
    doc.text('Account Name: iConnections LLC');
    doc.text('Account Number: 123456789');
    doc.text('SWIFT: FNBKUS33');
    doc.moveDown(0.5);
    doc.fillColor(BRAND_PURPLE).font('Helvetica-Bold').text('Reference (required):');
    doc.fillColor('#1A1A1A').font('Helvetica').text(`${invoice.id} / ${deal.company}`);
    doc.moveDown(1);
    doc.text('Questions? Contact finance@iconnections.io');

    doc.end();
    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
  });
}

// ─── Mock Implementation ───────────────────────────────────────────────────────

export class InvoiceMockClient implements IInvoiceClient {
  private invoices: Map<string, Invoice> = new Map();
  private sentAt: Map<string, number> = new Map();

  constructor(private readonly paymentDelayMs: number = 0) {}

  async createInvoice(deal: Deal, dueDate: string): Promise<Invoice> {
    const id = generateInvoiceId(deal.id);
    const invoice: Invoice = {
      id,
      dealId: deal.id,
      amount: deal.invoiceAmount,
      status: 'pending',
      dueDate,
    };
    this.invoices.set(id, invoice);
    console.log(`  [Invoice] Created ${id} for ${deal.company} — ${dollars(deal.invoiceAmount)}, due ${dueDate}`);
    return { ...invoice };
  }

  async sendInvoice(invoiceId: string, deal: Deal): Promise<string> {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) throw new Error(`Invoice not found: ${invoiceId}`);

    const pdfPath = await buildPdf(invoice, deal);
    invoice.status = 'sent';
    invoice.sentAt = new Date().toISOString();
    invoice.pdfPath = pdfPath;
    this.sentAt.set(invoiceId, Date.now());

    console.log(`  [Invoice] Sent ${invoiceId} → PDF at ${pdfPath}`);
    return pdfPath;
  }

  async pollForPayment(invoiceId: string): Promise<{ paid: boolean; paidAt?: string; amount?: number }> {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) throw new Error(`Invoice not found: ${invoiceId}`);

    if (invoice.status === 'paid') {
      return { paid: true, paidAt: invoice.paidAt, amount: invoice.amount };
    }
    if (invoice.status === 'needs_human_followup' || invoice.status === 'overdue') {
      return { paid: false };
    }

    const elapsed = Date.now() - (this.sentAt.get(invoiceId) ?? Date.now());
    if (elapsed >= this.paymentDelayMs) {
      invoice.status = 'paid';
      invoice.paidAt = new Date().toISOString();
      console.log(`  [Invoice] Payment received for ${invoiceId}: ${dollars(invoice.amount)} (delay ${Math.round(elapsed / 1000)}s)`);
      return { paid: true, paidAt: invoice.paidAt, amount: invoice.amount };
    }

    return { paid: false };
  }

  async getInvoice(invoiceId: string): Promise<Invoice> {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) throw new Error(`Invoice not found: ${invoiceId}`);
    return { ...invoice };
  }

  async markOverdue(invoiceId: string): Promise<void> {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) throw new Error(`Invoice not found: ${invoiceId}`);
    invoice.status = 'overdue';
    console.log(`  [Invoice] ${invoiceId} marked overdue`);
  }

  async flagNeedsFollowUp(invoiceId: string): Promise<void> {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) throw new Error(`Invoice not found: ${invoiceId}`);
    invoice.status = 'needs_human_followup';
    invoice.needsHumanFollowUp = true;
    console.log(`  [Invoice] ${invoiceId} flagged: needs human follow-up`);
  }
}

// ─── Live Implementation (stub) ────────────────────────────────────────────────

export class InvoiceLiveClient implements IInvoiceClient {
  constructor(private readonly baseUrl: string, private readonly apiKey: string) {}

  async createInvoice(_deal: Deal, _dueDate: string): Promise<Invoice> {
    throw new Error('InvoiceLiveClient.createInvoice: not yet wired up');
  }

  async sendInvoice(_invoiceId: string, _deal: Deal): Promise<string> {
    throw new Error('InvoiceLiveClient.sendInvoice: not yet wired up');
  }

  async pollForPayment(_invoiceId: string): Promise<{ paid: boolean; paidAt?: string; amount?: number }> {
    throw new Error('InvoiceLiveClient.pollForPayment: not yet wired up');
  }

  async getInvoice(_invoiceId: string): Promise<Invoice> {
    throw new Error('InvoiceLiveClient.getInvoice: not yet wired up');
  }

  async markOverdue(_invoiceId: string): Promise<void> {
    throw new Error('InvoiceLiveClient.markOverdue: not yet wired up');
  }

  async flagNeedsFollowUp(_invoiceId: string): Promise<void> {
    throw new Error('InvoiceLiveClient.flagNeedsFollowUp: not yet wired up');
  }
}

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
} from '../utils/templates';
