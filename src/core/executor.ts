import { randomUUID } from 'node:crypto';
import { canonicalHash } from './crypto.js';
import type { CreateOrderRequest, Ledger, RazorpayGateway } from '../contracts/interfaces.js';
import type { Decision, ExecutionRecord, ExecutionToken, ProposedAction } from '../contracts/schemas.js';

export const TOKEN_TTL_MS = 60_000;

export class ExecutorError extends Error {}

// Maps adapter-layer errors to execution status (T09 error names; matched by
// name so core never imports adapters).
function classifyError(err: unknown): 'FAILED' | 'UNKNOWN' {
  const name = err instanceof Error ? err.name : '';
  if (name === 'RzpNetworkError' || name === 'RzpUnknownError' || name === 'TimeoutError') {
    return 'UNKNOWN';
  }
  return 'FAILED';
}

// The ONLY code path allowed to call Razorpay (PLAN.md §03 trust model).
// Mechanical: consumes a verifier ALLOW exactly once, then records everything.
export class Executor {
  constructor(
    private readonly ledger: Ledger,
    private readonly clock: () => number = () => Date.now(),
  ) {}

  async issueToken(decision: Decision): Promise<ExecutionToken> {
    if (decision.verdict !== 'ALLOW') {
      throw new ExecutorError('execution tokens are only issued for ALLOW decisions');
    }
    const token: ExecutionToken = {
      token_id: `tok_${randomUUID()}`,
      decision_id: decision.decision_id,
      expires_at: this.clock() + TOKEN_TTL_MS,
      used: false,
    };
    await this.ledger.append('token.issued', token);
    return token;
  }

  async execute(args: {
    decision: Decision;
    token: ExecutionToken | undefined;
    gateway: RazorpayGateway;
    action: ProposedAction;
  }): Promise<ExecutionRecord> {
    const { decision, token, gateway, action } = args;
    if (decision.verdict !== 'ALLOW') {
      throw new ExecutorError('refusing to execute a DENY decision');
    }
    if (!token) throw new ExecutorError('execution requires a single-use token');
    if (token.decision_id !== decision.decision_id) {
      throw new ExecutorError('token does not match decision');
    }
    const stored = this.ledger.replay().tokens.get(token.token_id);
    if (!stored) throw new ExecutorError('unknown token');
    if (stored.used) throw new ExecutorError('token already used');
    if (this.clock() > stored.expires_at) throw new ExecutorError('token expired');

    // Commit the token BEFORE any network call: no gateway call without a
    // burned token, so a crash can never silently re-execute (I3).
    await this.ledger.append('token.used', { token_id: token.token_id });

    const receipt = `rp-${decision.decision_id}`.slice(0, 40);
    const request: CreateOrderRequest = {
      amount_paise: action.amount_paise,
      currency: action.currency,
      receipt,
      notes: {
        mandate_id: decision.mandate_id,
        decision_id: decision.decision_id,
        action_hash: decision.action_hash,
      },
    };
    const request_hash = canonicalHash(request);
    const base: Omit<ExecutionRecord, 'status' | 'razorpay_order_id' | 'response'> = {
      execution_id: `exe_${randomUUID()}`,
      decision_id: decision.decision_id,
      receipt,
      request_hash,
      executed_at: this.clock(),
    };

    try {
      const order = await gateway.createOrder(request);
      const record: ExecutionRecord = {
        ...base,
        status: 'CREATED',
        razorpay_order_id: order.id,
        response: order,
      };
      await this.ledger.append('execution.recorded', record);
      return record;
    } catch (err) {
      const record: ExecutionRecord = { ...base, status: classifyError(err) };
      await this.ledger.append('execution.recorded', record);
      return record;
    }
  }
}
