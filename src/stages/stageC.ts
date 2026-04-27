import { Clients, Deal, DealState } from '../types';

// Stage C — Payment Detection
// Polls invoice layer; emits invoice.paid to trigger Stage D.
// Idempotent: skips if already complete
export async function runStageC(deal: Deal, state: DealState, clients: Clients): Promise<DealState> {
  if (state.stages.C === 'complete') return state;
  if (state.stages.B !== 'complete') throw new Error('Stage C requires Stage B to be complete');
  state.stages.C = 'running';

  if (!state.invoiceId) throw new Error('No invoice ID on deal state');

  const { paid, paidAt, amount } = await clients.invoice.pollForPayment(state.invoiceId);
  if (!paid) {
    state.stages.C = 'pending';
    return state; // not yet paid — caller should retry later
  }

  state.invoicePaidAt = paidAt;
  state.paymentAmount = amount;
  state.invoiceStatus = 'paid';
  state.needsHumanFollowUp = false; // clear any overdue flag

  state.stages.C = 'complete';

  if (state.teamsCardId) {
    await clients.teams.patchCard(
      state.teamsCardId,
      deal,
      state,
      'payment_received',
    );
  }

  state.auditLog.push({
    timestamp: paidAt ?? new Date().toISOString(),
    stage: 'C',
    action: 'payment_received',
    data: { amount, paidAt },
  });

  return state;
}
