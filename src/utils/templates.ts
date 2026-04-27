import { CSM, Deal, EventRecord, Invoice } from '../types';

const BRAND_PURPLE = '#6A2B7E';

function dollars(n: number): string {
  return '$' + n.toLocaleString('en-US');
}

export function renderInvoiceEmailHtml(deal: Deal, invoice: Invoice): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><style>
  body{font-family:Arial,sans-serif;color:#1A1A1A;background:#fff;margin:0;padding:0}
  .header{background:${BRAND_PURPLE};color:#fff;padding:24px 32px}
  .header h1{margin:0;font-size:22px}
  .body{padding:32px}
  .footer{border-top:2px solid ${BRAND_PURPLE};padding:16px 32px;font-size:12px;color:#666}
</style></head>
<body>
  <div class="header"><h1>iConnections</h1></div>
  <div class="body">
    <p>Hi ${deal.primaryContact.name.split(' ')[0]},</p>
    <p>Please find attached invoice <strong>${invoice.id}</strong> for <strong>${dollars(invoice.amount)}</strong>, due <strong>${invoice.dueDate}</strong>.</p>
    <p>Wire instructions are on page 2 of the PDF.</p>
    <p>Any questions, just reply to this email and my teammate ${deal.salesRepName} will jump in.</p>
    <p>Thanks,<br>iConnections Finance</p>
  </div>
  <div class="footer">iConnections &bull; confidential</div>
</body></html>`;
}

export function renderInvoiceEmailText(deal: Deal, invoice: Invoice): string {
  return `Hi ${deal.primaryContact.name.split(' ')[0]},

Please find attached invoice ${invoice.id} for ${dollars(invoice.amount)}, due ${invoice.dueDate}.

Wire instructions are on page 2 of the PDF.

Any questions, just reply to this email and my teammate ${deal.salesRepName} will jump in.

Thanks,
iConnections Finance`;
}

export function renderNudge1Html(deal: Deal, invoice: Invoice): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><style>
  body{font-family:Arial,sans-serif;color:#1A1A1A;background:#fff;margin:0;padding:0}
  .header{background:${BRAND_PURPLE};color:#fff;padding:24px 32px}
  .header h1{margin:0;font-size:22px}
  .body{padding:32px}
  .footer{border-top:2px solid ${BRAND_PURPLE};padding:16px 32px;font-size:12px;color:#666}
</style></head>
<body>
  <div class="header"><h1>iConnections</h1></div>
  <div class="body">
    <p>Hi ${deal.primaryContact.name.split(' ')[0]},</p>
    <p>Quick nudge — invoice <strong>${invoice.id}</strong> for <strong>${dollars(invoice.amount)}</strong> is due on <strong>${invoice.dueDate}</strong>.</p>
    <p>I've re-attached it here for convenience. Let us know if you need anything from our side to process payment.</p>
    <p>Thanks,<br>iConnections Finance</p>
  </div>
  <div class="footer">iConnections &bull; confidential</div>
</body></html>`;
}

export function renderNudge1Text(deal: Deal, invoice: Invoice): string {
  return `Hi ${deal.primaryContact.name.split(' ')[0]},

Quick nudge — invoice ${invoice.id} for ${dollars(invoice.amount)} is due on ${invoice.dueDate}.

I've re-attached it here for convenience. Let us know if you need anything from our side to process payment.

Thanks,
iConnections Finance`;
}

export function renderNudge2Html(deal: Deal, invoice: Invoice): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><style>
  body{font-family:Arial,sans-serif;color:#1A1A1A;background:#fff;margin:0;padding:0}
  .header{background:${BRAND_PURPLE};color:#fff;padding:24px 32px}
  .header h1{margin:0;font-size:22px}
  .body{padding:32px}
  .footer{border-top:2px solid ${BRAND_PURPLE};padding:16px 32px;font-size:12px;color:#666}
</style></head>
<body>
  <div class="header"><h1>iConnections</h1></div>
  <div class="body">
    <p>Hi ${deal.primaryContact.name.split(' ')[0]},</p>
    <p>Our records show invoice <strong>${invoice.id}</strong> for <strong>${dollars(invoice.amount)}</strong> was due on <strong>${invoice.dueDate}</strong> and we haven't yet received the wire.</p>
    <p>Could you confirm where this sits on your end? Happy to resend the invoice or wire details if needed.</p>
    <p>I've cc'd ${deal.salesRepName} so we can help unblock anything on our side.</p>
    <p>Thanks,<br>iConnections Finance</p>
  </div>
  <div class="footer">iConnections &bull; confidential</div>
</body></html>`;
}

export function renderNudge2Text(deal: Deal, invoice: Invoice): string {
  return `Hi ${deal.primaryContact.name.split(' ')[0]},

Our records show invoice ${invoice.id} for ${dollars(invoice.amount)} was due on ${invoice.dueDate} and we haven't yet received the wire.

Could you confirm where this sits on your end? Happy to resend the invoice or wire details if needed.

I've cc'd ${deal.salesRepName} so we can help unblock anything on our side.

Thanks,
iConnections Finance`;
}

export function renderCsmNotificationHtml(
  deal: Deal,
  csm: CSM,
  invoice: Invoice,
  copilotUrl: string,
): string {
  const events = deal.events.join(', ') || 'None';
  const subEnd = deal.subscriptionEndDate ?? 'N/A (Event Only)';
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><style>
  body{font-family:Arial,sans-serif;color:#1A1A1A;background:#fff;margin:0;padding:0}
  .header{background:${BRAND_PURPLE};color:#fff;padding:24px 32px}
  .header h1{margin:0;font-size:22px}
  .body{padding:32px}
  ul{line-height:1.8}
  a{color:${BRAND_PURPLE}}
  .footer{border-top:2px solid ${BRAND_PURPLE};padding:16px 32px;font-size:12px;color:#666}
</style></head>
<body>
  <div class="header"><h1>[New Onboarding] ${deal.company}</h1></div>
  <div class="body">
    <p>Hi ${csm.name.split(' ')[0]},</p>
    <p><strong>${deal.company}</strong> has just been onboarded and you're their assigned ${csm.tier} CSM. Summary:</p>
    <ul>
      <li><strong>Deal type:</strong> ${deal.dealType}</li>
      <li><strong>Invoice:</strong> ${dollars(invoice.amount)} (paid ${invoice.paidAt ?? 'pending'})</li>
      <li><strong>Firm AUM:</strong> ${dollars(deal.aumDollars)}</li>
      <li><strong>Events registered:</strong> ${events}</li>
      <li><strong>Subscription end:</strong> ${subEnd}</li>
      <li><strong>Primary contact:</strong> ${deal.primaryContact.name} — ${deal.primaryContact.email} — ${deal.primaryContact.mobile}</li>
      <li><strong>Copilot v3 record:</strong> <a href="${copilotUrl}">${copilotUrl}</a></li>
    </ul>
    <p>The client has been sent their welcome email with a link to book their onboarding call with you. Please reach out if you don't hear from them within 3 business days.</p>
    <p>— Onboarding Bot</p>
  </div>
  <div class="footer">iConnections &bull; confidential</div>
</body></html>`;
}

export function renderCsmNotificationText(
  deal: Deal,
  csm: CSM,
  invoice: Invoice,
  copilotUrl: string,
): string {
  const events = deal.events.join(', ') || 'None';
  const subEnd = deal.subscriptionEndDate ?? 'N/A (Event Only)';
  return `Hi ${csm.name.split(' ')[0]},

${deal.company} has just been onboarded and you're their assigned ${csm.tier} CSM. Summary:

  • Deal type: ${deal.dealType}
  • Invoice: ${dollars(invoice.amount)} (paid ${invoice.paidAt ?? 'pending'})
  • Firm AUM: ${dollars(deal.aumDollars)}
  • Events registered: ${events}
  • Subscription end: ${subEnd}
  • Primary contact: ${deal.primaryContact.name} — ${deal.primaryContact.email} — ${deal.primaryContact.mobile}
  • Copilot v3 record: ${copilotUrl}

The client has been sent their welcome email with a link to book their onboarding call with you. Please reach out if you don't hear from them within 3 business days.

— Onboarding Bot`;
}

export function renderClientWelcomeHtml(deal: Deal, csm: CSM, events: EventRecord[]): string {
  const eventNames = deal.events.join(', ') || 'None';
  const calendlyUrl = `https://calendly.com/${csm.name.toLowerCase().replace(/\s+/g, '-')}/kickoff`;
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><style>
  body{font-family:Arial,sans-serif;color:#1A1A1A;background:#fff;margin:0;padding:0}
  .header{background:${BRAND_PURPLE};color:#fff;padding:24px 32px}
  .header h1{margin:0;font-size:22px}
  .body{padding:32px}
  ol{line-height:1.8}
  .btn{display:inline-block;background:${BRAND_PURPLE};color:#fff;padding:10px 24px;text-decoration:none;border-radius:4px;margin-top:12px}
  a{color:${BRAND_PURPLE}}
  .footer{border-top:2px solid ${BRAND_PURPLE};padding:16px 32px;font-size:12px;color:#666}
</style></head>
<body>
  <div class="header"><h1>Welcome to iConnections, ${deal.company}!</h1></div>
  <div class="body">
    <p>Hi ${deal.primaryContact.name.split(' ')[0]},</p>
    <p>Thanks for partnering with iConnections — we're thrilled to have <strong>${deal.company}</strong> on the platform. Here's how to get started:</p>
    <ol>
      <li><strong>Log in:</strong> <a href="https://platform.iconnections.io">https://platform.iconnections.io</a></li>
      <li>You'll be prompted to set a new password on first login.</li>
      <li>Head to "Firm Profile" and update your fund details, team bios, and strategy documents.</li>
      <li>You're registered for: <strong>${eventNames}</strong> — access these under "My Events".</li>
    </ol>
    <p>Your dedicated Client Success Manager is <strong>${csm.name}</strong>. Book your kickoff call here:</p>
    <a class="btn" href="${calendlyUrl}">Book kickoff call</a>
    <p style="margin-top:24px">Any questions in the meantime, just reply — we're here.</p>
    <p>Welcome aboard,<br><strong>The iConnections Team</strong></p>
  </div>
  <div class="footer">iConnections &bull; confidential</div>
</body></html>`;
}

export function renderClientWelcomeText(deal: Deal, csm: CSM, _events: EventRecord[]): string {
  const eventNames = deal.events.join(', ') || 'None';
  const calendlyUrl = `https://calendly.com/${csm.name.toLowerCase().replace(/\s+/g, '-')}/kickoff`;
  return `Hi ${deal.primaryContact.name.split(' ')[0]},

Thanks for partnering with iConnections — we're thrilled to have ${deal.company} on the platform. Here's how to get started:

  1. Log in: https://platform.iconnections.io
  2. You'll be prompted to set a new password on first login.
  3. Head to "Firm Profile" and update your fund details, team bios, and strategy documents.
  4. You're registered for: ${eventNames} — access these under "My Events".

Your dedicated Client Success Manager is ${csm.name}. Book your kickoff call here: ${calendlyUrl}

Any questions in the meantime, just reply — we're here.

Welcome aboard,
The iConnections Team`;
}
