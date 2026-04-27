import { ClientReply, Deal, DealState } from '../types';

const WIRE_REFS = [
  'WR2204917','WR8834521','WR5591043','WR3312908','WR7723015',
  'WR4481293','WR9916540','WR6627883','WR1134027','WR8823654','WR5546120','WR2203741',
];

function addMinutes(iso: string, mins: number): string {
  return new Date(new Date(iso).getTime() + mins * 60_000).toISOString();
}

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

function seed(dealId: string): number {
  return dealId.split('').reduce((n, c) => n + c.charCodeAt(0), 0);
}

export function generateReplies(deal: Deal, state: DealState): ClientReply[] {
  if (!state.invoiceSentAt) return [];

  const replies: ClientReply[] = [];
  const s     = seed(deal.id);
  const first = deal.primaryContact.name.split(' ')[0];
  const fin   = 'finance@iconnections.io';
  const wire  = WIRE_REFS[s % WIRE_REFS.length];
  const count = 1 + (s % 3); // 1–3 per deal

  // ── Reply 1: acknowledgment within ~45 min of invoice ─────────────
  const ack1Templates = [
    {
      body: `Hi,\n\nThanks for sending this over. I've forwarded it to our finance team for processing — should settle by end of week.\n\nBest,\n${first}`,
    },
    {
      body: `Hi,\n\nReceived, thank you. Quick question — does the wire go to the same account as last year, or are the instructions on the PDF different this time?\n\nThanks,\n${first}`,
    },
    {
      body: `Got it — could you resend the wire instructions? The PDF attachment came through blank on my end.\n\nApologies for the hassle.\n— ${first}`,
    },
    {
      body: `Hi Finance,\n\nConfirmed — I have the invoice. I'll get our CFO to approve and we'll process the wire early next week.\n\nBest,\n${first}`,
    },
  ];
  replies.push({
    id:        `REPLY-${deal.id}-1`,
    dealId:    deal.id,
    timestamp: addMinutes(state.invoiceSentAt, 28 + (s % 60)),
    fromName:  deal.primaryContact.name,
    fromEmail: deal.primaryContact.email,
    toEmail:   fin,
    subject:   `Re: Invoice ${state.invoiceId ?? ''} from iConnections — ${deal.company}`,
    body:      pick(ack1Templates, s).body,
    stage:     'A',
  });

  // ── Reply 2: payment confirmation (before payment lands) ───────────
  if (count >= 2 && state.invoicePaidAt) {
    const payTemplates = [
      { body: `Hi,\n\nJust a heads up — our finance team sent the wire this morning. Reference: ${wire}. Please confirm once you see it clear.\n\nThanks,\n${first}` },
      { body: `Hi,\n\nWire is on its way — ref ${wire}. Let me know once it lands and we're good to go.\n\nBest,\n${first}` },
      { body: `Hi,\n\nSorry for the delay — our CFO was travelling. Wire has gone out today, ref ${wire}.\n\nThanks,\n${first}` },
    ];
    replies.push({
      id:        `REPLY-${deal.id}-2`,
      dealId:    deal.id,
      timestamp: addMinutes(state.invoicePaidAt, -(90 + (s % 120))),
      fromName:  deal.primaryContact.name,
      fromEmail: deal.primaryContact.email,
      toEmail:   fin,
      subject:   `Re: Invoice ${state.invoiceId ?? ''} from iConnections — ${deal.company}`,
      body:      pick(payTemplates, s + 1).body,
      stage:     'C',
    });
  }

  // ── Reply 3: post-welcome response to CSM ─────────────────────────
  if (count >= 3 && state.stages.G === 'complete' && state.assignedCsm) {
    const csmFirst  = state.assignedCsm.name.split(' ')[0];
    const closeTs   = state.auditLog.find(e => e.action === 'deal_closed_onboarded')?.timestamp ?? state.invoicePaidAt!;
    const welTemplates = [
      { body: `Hi ${csmFirst},\n\nThanks so much — we're excited to get started. Booking my kickoff call shortly. One quick question: can we add a second user from our team, or is this a single-seat license?\n\nBest,\n${first}` },
      { body: `Hi ${csmFirst},\n\nWonderful — looking forward to it! I've already booked the kickoff for next Thursday via Calendly. You should have an invite.\n\nSee you then,\n${first}` },
      { body: `Hi ${csmFirst},\n\nThanks for the welcome! The platform looks great so far. Quick note: our firm profile is still showing last year's AUM. Is that something I update myself, or do you handle it?\n\nThanks,\n${first}` },
      { body: `Hi ${csmFirst},\n\nGreat, all set on our end. Quick heads-up — our primary contact is actually switching to my colleague next quarter, so we'll need to update the account details. Happy to discuss on the kickoff call.\n\nBest,\n${first}` },
    ];
    replies.push({
      id:        `REPLY-${deal.id}-3`,
      dealId:    deal.id,
      timestamp: addMinutes(closeTs, 38 + (s % 80)),
      fromName:  deal.primaryContact.name,
      fromEmail: deal.primaryContact.email,
      toEmail:   state.assignedCsm.email,
      subject:   `Re: Welcome to iConnections, ${deal.company}!`,
      body:      pick(welTemplates, s + 2).body,
      stage:     'G',
    });
  }

  return replies.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
