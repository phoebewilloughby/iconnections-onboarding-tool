import fs from 'fs';
import path from 'path';
import { Deal, DealState, ITeamsClient, TeamsCardMutation, TeamsCardState } from '../types';

const TEAMS_DIR = path.join(process.cwd(), 'runs', 'teams');

function now(): string {
  return new Date().toISOString();
}

function stageLabel(state: DealState): string {
  const stageOrder: Array<'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'> = ['G', 'F', 'E', 'D', 'C', 'B', 'A'];
  for (const s of stageOrder) {
    if (state.stages[s] === 'complete') {
      const names: Record<string, string> = {
        A: 'A: Invoice Sent',
        B: 'B: Nudge Scheduled',
        C: 'C: Payment Received',
        D: 'D: Deal Tagged',
        E: 'E: CSM Assigned',
        F: 'F: Copilot Registered',
        G: 'G: Onboarded',
      };
      return `Stage ${names[s]}`;
    }
  }
  return 'Stage A: Invoice Sent';
}

function buildCardState(deal: Deal, state: DealState): TeamsCardState {
  return {
    headerCompany: deal.company,
    headerDealId: deal.id,
    headerStage: stageLabel(state),
    headerBadge: state.needsHumanFollowUp
      ? 'Overdue'
      : state.stages.G === 'complete'
      ? 'Closed · Onboarded'
      : undefined,
    invoiceSentChecked: state.stages.A === 'complete',
    invoiceSentTimestamp: state.invoiceSentAt,
    paymentReceivedChecked: state.stages.C === 'complete',
    paymentReceivedTimestamp: state.invoicePaidAt,
    paymentAmount: state.paymentAmount,
    dealTaggedChecked: state.stages.D === 'complete',
    dealTaggedTimestamp: state.stages.D === 'complete' ? now() : undefined,
    dealTaggedTags: state.tagsApplied,
    csmAssignedChecked: state.stages.E === 'complete',
    csmAssignedTimestamp: state.stages.E === 'complete' ? now() : undefined,
    csmAssignedName: state.assignedCsm?.name,
    copilotRegisteredChecked: state.stages.F === 'complete',
    copilotRegisteredTimestamp: state.stages.F === 'complete' ? now() : undefined,
    copilotRegisteredClients: state.copilotClientIds?.length,
    copilotRegisteredEvents: state.stages.F === 'complete'
      ? deal.events.length * (state.copilotClientIds?.length ?? 1)
      : undefined,
    onboardedChecked: state.stages.G === 'complete',
    onboardedTimestamp: state.stages.G === 'complete' ? now() : undefined,
    footerCsm: state.assignedCsm?.name,
    footerInvoiceAmount: deal.invoiceAmount,
    footerEvents: deal.events,
    footerSubEnd: state.computedSubEndDate ?? deal.subscriptionEndDate ?? undefined,
  };
}

function renderCardText(card: TeamsCardState): string {
  const check = (v: boolean) => (v ? '[x]' : '[ ]');
  const badge = card.headerBadge ? `  ⚑ ${card.headerBadge}` : '';
  const lines = [
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `HEADER:  ${card.headerCompany}  ·  ${card.headerDealId}  ·  [${card.headerStage}]${badge}`,
    ``,
    `CHECKLIST:`,
    `  ${check(card.invoiceSentChecked)} Invoice sent${card.invoiceSentTimestamp ? `       — ${card.invoiceSentTimestamp}` : ''}`,
    `  ${check(card.paymentReceivedChecked)} Payment received${card.paymentReceivedChecked && card.paymentAmount ? `  — ${card.paymentReceivedTimestamp} · $${card.paymentAmount.toLocaleString()}` : ''}`,
    `  ${check(card.dealTaggedChecked)} Deal tagged${card.dealTaggedChecked && card.dealTaggedTags ? `       — ${card.dealTaggedTimestamp} · ${card.dealTaggedTags.join(', ')}` : ''}`,
    `  ${check(card.csmAssignedChecked)} CSM assigned${card.csmAssignedChecked ? `      — ${card.csmAssignedTimestamp} · ${card.csmAssignedName}${card.mentions?.length ? ` (@${card.mentions[0]})` : ''}` : ''}`,
    `  ${check(card.copilotRegisteredChecked)} Copilot registered${card.copilotRegisteredChecked ? ` — ${card.copilotRegisteredTimestamp} · ${card.copilotRegisteredClients} client(s), ${card.copilotRegisteredEvents} event(s)` : ''}`,
    `  ${check(card.onboardedChecked)} Onboarded${card.onboardedTimestamp ? `         — ${card.onboardedTimestamp}` : ''}`,
    ``,
    `FOOTER:  CSM: ${card.footerCsm ?? '—'} · Invoice $${card.footerInvoiceAmount?.toLocaleString()} · Events: ${(card.footerEvents ?? []).join('; ') || '—'} · Sub end: ${card.footerSubEnd ?? 'N/A'}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
  ];
  return lines.join('\n');
}

// ─── Mock Implementation ───────────────────────────────────────────────────────

export class TeamsMockClient implements ITeamsClient {
  private cardStates: Map<string, TeamsCardState> = new Map();
  private mutations: Map<string, TeamsCardMutation[]> = new Map();

  async postDealWon(deal: Deal): Promise<void> {
    const msg = {
      channel: 'Deal Won',
      timestamp: now(),
      dealId: deal.id,
      company: deal.company,
      message: `🎉 Deal ready to invoice: ${deal.company} (${deal.id}) — $${deal.invoiceAmount.toLocaleString()}`,
    };
    fs.mkdirSync(TEAMS_DIR, { recursive: true });
    const filePath = path.join(TEAMS_DIR, 'deal_won_channel.jsonl');
    fs.appendFileSync(filePath, JSON.stringify(msg) + '\n');
    console.log(`  [Teams] Deal Won channel: ${deal.company} posted`);
  }

  async createOnboardingCard(deal: Deal, state: DealState): Promise<string> {
    const cardId = `CARD-${deal.id}`;
    const cardState = buildCardState(deal, state);
    this.cardStates.set(cardId, cardState);

    const mutation: TeamsCardMutation = {
      timestamp: now(),
      type: 'create',
      dealId: deal.id,
      cardState,
    };
    const list = this.mutations.get(deal.id) ?? [];
    list.push(mutation);
    this.mutations.set(deal.id, list);

    this._writeJsonl(deal.id, mutation);
    console.log(`  [Teams] Onboarding card created for ${deal.id}`);
    return cardId;
  }

  async patchCard(
    cardId: string,
    deal: Deal,
    state: DealState,
    reason: string,
    mentions?: string[],
  ): Promise<void> {
    const cardState = buildCardState(deal, state);
    if (mentions?.length) cardState.mentions = mentions;
    this.cardStates.set(cardId, cardState);

    const mutation: TeamsCardMutation = {
      timestamp: now(),
      type: 'patch',
      dealId: deal.id,
      patchReason: reason,
      cardState,
    };
    const list = this.mutations.get(deal.id) ?? [];
    list.push(mutation);
    this.mutations.set(deal.id, list);

    this._writeJsonl(deal.id, mutation);
    console.log(`  [Teams] Card ${cardId} patched: ${reason}`);
  }

  private _writeJsonl(dealId: string, mutation: TeamsCardMutation): void {
    fs.mkdirSync(TEAMS_DIR, { recursive: true });
    const filePath = path.join(TEAMS_DIR, `${dealId}.jsonl`);
    fs.appendFileSync(filePath, JSON.stringify(mutation) + '\n');
  }

  getMutations(dealId: string): TeamsCardMutation[] {
    return [...(this.mutations.get(dealId) ?? [])];
  }

  getCardState(cardId: string): TeamsCardState | undefined {
    return this.cardStates.get(cardId);
  }

  writeChannelFeed(deals: Deal[], states: DealState[]): void {
    fs.mkdirSync(TEAMS_DIR, { recursive: true });
    const feedPath = path.join(TEAMS_DIR, 'channel_feed.txt');
    const lines: string[] = [
      '═══════════════════════════════════════════════════════════',
      '  📋  Onboarding Process Channel — final state (simulated)',
      `  Generated: ${now()}`,
      '═══════════════════════════════════════════════════════════',
      '',
    ];

    for (const state of states) {
      const deal = deals.find(d => d.id === state.dealId);
      if (!deal) continue;
      const cardId = `CARD-${deal.id}`;
      const card = this.cardStates.get(cardId);
      if (card) {
        lines.push(renderCardText(card));
        lines.push('');
      }
    }

    fs.writeFileSync(feedPath, lines.join('\n'));
    console.log(`\n  [Teams] Channel feed written → ${feedPath}`);
  }
}

// ─── Live Implementation (stub) ────────────────────────────────────────────────

export class TeamsLiveClient implements ITeamsClient {
  constructor(
    private readonly tenantId: string,
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly dealWonChannelId: string,
    private readonly onboardingChannelId: string,
  ) {}

  async postDealWon(_deal: Deal): Promise<void> {
    // TODO: POST https://graph.microsoft.com/v1.0/teams/{teamId}/channels/{dealWonChannelId}/messages
    // Body: { body: { contentType: 'html', content: '<p>Deal won: ...</p>' } }
    // Auth: OAuth2 client_credentials with scope https://graph.microsoft.com/.default
    // Note: TeamsClient stays on MockImpl until card-update pattern is validated end-to-end
    throw new Error('TeamsLiveClient.postDealWon: not yet wired up');
  }

  async createOnboardingCard(_deal: Deal, _state: DealState): Promise<string> {
    // TODO: POST https://graph.microsoft.com/v1.0/teams/{teamId}/channels/{onboardingChannelId}/messages
    // Body: Adaptive Card JSON with iConnections purple (#6A2B7E) accent bar
    // Returns: message ID to use as cardId for subsequent PATCH calls
    // Webhooks are intentionally NOT used — they cannot edit messages
    throw new Error('TeamsLiveClient.createOnboardingCard: not yet wired up');
  }

  async patchCard(
    _cardId: string,
    _deal: Deal,
    _state: DealState,
    _reason: string,
    _mentions?: string[],
  ): Promise<void> {
    // TODO: PATCH https://graph.microsoft.com/v1.0/teams/{teamId}/channels/{onboardingChannelId}/messages/{cardId}
    // For @mentions: include mentions array in the message body:
    //   { mentions: [{ id: 0, mentionText: 'CSM Name', mentioned: { user: { id: aadObjectId } } }] }
    // Requires User.Read.All or similar permission to resolve AAD object IDs from email
    throw new Error('TeamsLiveClient.patchCard: not yet wired up');
  }
}
