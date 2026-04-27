import { HubSpotMockClient } from './clients/HubSpotClient';
import { CopilotMockClient } from './clients/CopilotClient';
import { InvoiceMockClient } from './clients/InvoiceClient';
import { EmailMockClient } from './clients/EmailClient';
import { TeamsMockClient } from './clients/TeamsClient';
import { Clients, DealState } from './types';
import { CsmRouter } from './utils/csmRouting';
import { runDeal, printSummary } from './orchestrator';
import { DEALS, CSMS, EVENTS } from '../test/fixtures/deals';

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  iConnections Automated Onboarding — Mock Test Run');
  console.log(`  ${DEALS.length} deals · ${CSMS.length} CSMs · ${EVENTS.length} events`);
  console.log('═══════════════════════════════════════════════════════════\n');

  const hubspot = new HubSpotMockClient(DEALS);
  const copilot = new CopilotMockClient();
  const invoice = new InvoiceMockClient();
  const email = new EmailMockClient();
  const teams = new TeamsMockClient();

  const clients: Clients = { hubspot, copilot, invoice, email, teams };
  const router = new CsmRouter();
  const states: DealState[] = [];

  for (const deal of DEALS) {
    console.log(`\n──── ${deal.id}  ${deal.company} ────`);
    const state = await runDeal(deal, clients, router, CSMS, EVENTS);
    states.push(state);
  }

  // Write Teams channel feed showing all 12 deal cards
  teams.writeChannelFeed(DEALS, states);

  // Print summary for each deal
  console.log('\n\n═══════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  for (let i = 0; i < DEALS.length; i++) {
    printSummary(DEALS[i], states[i]);
  }

  const completed = states.filter(s => s.stages.G === 'complete').length;
  const failed = states.filter(s => s.stages.G !== 'complete').length;
  console.log(`\n  ✓ ${completed}/${DEALS.length} deals fully onboarded`);
  if (failed > 0) console.log(`  ✗ ${failed} deals incomplete — check runs/{deal_id}.json`);
  console.log('\n  Audit JSONs  →  ./runs/');
  console.log('  Teams feed   →  ./runs/teams/channel_feed.txt');
  console.log('  Invoice PDFs →  ./runs/invoices/\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
