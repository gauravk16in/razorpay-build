import type { CreateOrderRequest, RazorpayGateway, RzpOrder } from '../contracts/interfaces.js';
import { RzpDuplicateReceipt, RzpValidationError } from './razorpay.js';

// In-memory Razorpay stand-in for tests and harness (label: SYNTHETIC).
// Enforces the two behaviors the system relies on (F3, F1): receipt
// idempotency and amount validation.
export class FakeRazorpay implements RazorpayGateway {
  private orders = new Map<string, RzpOrder>();
  private byReceipt = new Map<string, string>();
  private counter = 0;
  private readonly clock: () => number;

  constructor(opts?: { clock?: () => number }) {
    this.clock = opts?.clock ?? (() => Date.now());
  }

  async createOrder(req: CreateOrderRequest): Promise<RzpOrder> {
    if (!Number.isInteger(req.amount_paise) || req.amount_paise < 100) {
      throw new RzpValidationError('The amount must be at least INR 1.00');
    }
    if (this.byReceipt.has(req.receipt)) {
      throw new RzpDuplicateReceipt(`Duplicate request. receipt "${req.receipt}" already processed.`);
    }
    const order: RzpOrder = {
      id: `order_FAKE${String(++this.counter).padStart(6, '0')}`,
      status: 'created',
      amount: req.amount_paise,
      currency: req.currency,
      receipt: req.receipt,
      created_at: Math.floor(this.clock() / 1000),
    };
    this.orders.set(order.id, order);
    this.byReceipt.set(req.receipt, order.id);
    return order;
  }

  async fetchOrder(id: string): Promise<RzpOrder> {
    const order = this.orders.get(id);
    if (!order) throw new RzpValidationError(`order ${id} not found`);
    return order;
  }

  async fetchAllOrders(): Promise<RzpOrder[]> {
    return [...this.orders.values()];
  }
}
