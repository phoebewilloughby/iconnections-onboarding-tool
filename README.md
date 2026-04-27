# iConnections Automated Onboarding Tool

Automates end-to-end client onboarding: invoice → payment → HubSpot tagging → CSM assignment → Copilot v3 registration → close & notify.

## Quick Start

```bash
npm install
npm run test:onboarding   # mock test run against all 12 deals
npm test                  # unit tests
```

## What the test run does

Processes all 12 deals from `test/fixtures/deals.ts` through stages A–G using mocked clients:

| Stage | Action |
|-------|--------|
| A | Generate invoice PDF, email client + cc Sales Rep, post to Teams Deal Won channel, create per-deal Teams card |
| B | Calculate nudge schedule (Nudge-1: T-3 bdays, Nudge-2: T+2 bdays) |
| C | Detect payment (mock: immediate), patch Teams card |
| D | Verify/apply HubSpot tags (deal type + events), halt on conflict |
| E | Route to Enterprise or Scale CSM, @mention on Teams card |
| F | Create/update Copilot v3 company + client records, register for events |
| G | Mark Closed Won, send CSM notification, send client welcome, patch Teams card |

## Output artifacts

```
runs/
  {deal_id}.json          — full audit trail per deal
  invoices/{inv_id}.pdf   — branded invoice PDFs
  teams/
    {deal_id}.jsonl       — one JSON line per card mutation
    deal_won_channel.jsonl — Deal Won channel log
    channel_feed.txt      — rendered Onboarding Process channel (all 12 deals)
```

## Project structure

```
src/
  clients/
    HubSpotClient.ts      — HubSpotMockClient + HubSpotLiveClient (stub)
    CopilotClient.ts      — CopilotMockClient + CopilotLiveClient (stub)
    InvoiceClient.ts      — InvoiceMockClient + InvoiceLiveClient (stub) + PDF generation
    EmailClient.ts        — EmailMockClient + EmailLiveClient (stub) + HTML/text templates
    TeamsClient.ts        — TeamsMockClient + TeamsLiveClient (stub)
  stages/
    stageA.ts … stageG.ts — one file per pipeline stage, all idempotent
  utils/
    businessDays.ts       — nudge date math (no external deps)
    csmRouting.ts         — tier detection + regional round-robin
    templates.ts          — HTML + plaintext email renderers
  orchestrator.ts         — runs stages A→G, saves audit JSON, prints summary
  index.ts                — entry point for test run
test/
  fixtures/deals.ts       — 12 deals, 6 CSMs, 6 events (hard-coded per spec)
  csmRouting.test.ts
  dealTagging.test.ts
  nudgeScheduling.test.ts
  teamsCard.test.ts
  idempotency.test.ts
```

## Switching from Mock to Live

Each client class has a `MockImpl` and a `LiveImpl`. To go live, swap the import in `src/index.ts`:

```diff
- import { HubSpotMockClient } from './clients/HubSpotClient';
+ import { HubSpotLiveClient } from './clients/HubSpotClient';

- const hubspot = new HubSpotMockClient(DEALS);
+ const hubspot = new HubSpotLiveClient(process.env.HUBSPOT_API_KEY!, process.env.HUBSPOT_PORTAL_ID!);
```

Do the same for `CopilotLiveClient` and `InvoiceLiveClient`. Required env vars:

```
HUBSPOT_API_KEY=...
HUBSPOT_PORTAL_ID=...
COPILOT_BASE_URL=https://copilot.iconnections.io
COPILOT_API_KEY=...
INVOICE_BASE_URL=...
INVOICE_API_KEY=...
SMTP_HOST=...           # or SendGrid API key
SMTP_PORT=587
SMTP_FROM=finance@iconnections.io
```

### Teams stays mocked longer

Per spec (Section 2.5), `TeamsClient` stays on `MockImpl` until the Adaptive Card update pattern is validated end-to-end. `TeamsLiveClient` is stubbed with TODOs pointing at the Graph API endpoints:

- `POST /teams/{teamId}/channels/{channelId}/messages` — create card
- `PATCH /teams/{teamId}/channels/{channelId}/messages/{messageId}` — update card (requires **not** using Incoming Webhooks, which can't edit)
- `@mention` shape: `{ mentions: [{ id, mentionText, mentioned: { user: { id: aadObjectId } } }] }`

To go live with Teams:
1. Register an Azure AD app with `ChannelMessage.Send` and `User.Read.All` permissions
2. Fill in `TEAMS_TENANT_ID`, `TEAMS_CLIENT_ID`, `TEAMS_CLIENT_SECRET`, `TEAMS_DEAL_WON_CHANNEL_ID`, `TEAMS_ONBOARDING_CHANNEL_ID`
3. Swap `TeamsMockClient` → `TeamsLiveClient` in `src/index.ts`

## Business rules summary

| Rule | Logic |
|------|-------|
| CSM tier | Enterprise if invoice > $25,000 OR AUM > $1B; else Scale |
| Regional routing | +1 → Americas; +44/+33/+41/+353/etc. → EMEA; +65/+81/+61/etc. → APAC; else Global |
| Deal-type tag | Exactly one of: Platform Renewal, New Client, Event Only |
| Event tags | One per event paid; required if Event Only |
| Pre-due nudge | 3 business days before due date |
| Post-due nudge | 2 business days after due date; cc Sales Rep; @mention Sales Rep on Teams card |
| Subscription end | Set for Platform Renewal + New Client; skip for Event Only |
| Halt conditions | Conflicting tags, missing primary contact, ambiguous Copilot match |

## Open questions (from spec §9)

1. **CSM round-robin**: Currently regional-first with fallback to Global-tier CSMs. Confirm: strictly regional, or regional-first with any-tier fallback?
2. **Platform Renewal sub end date**: Currently uses the date from the deal record. Confirm: extend from today, or from previous sub end?
3. **Welcome email cc**: Currently sent to primary contact only. Confirm: should CSM and/or Sales Rep be cc'd?
4. **Calendly URL pattern**: Currently `https://calendly.com/{csm-name-slug}/kickoff`. Confirm actual URL per CSM.
