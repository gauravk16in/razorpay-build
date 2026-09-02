import type { CartItem, CheckoutSnapshot } from '../contracts/schemas.js';

// In-memory demo cart. This whole module is a SYNTHETIC fixture (PLAN.md D4):
// it stands in for a real merchant so the demo can control checkout state.
export interface CartState {
  merchant_id: string;
  items: CartItem[];
  currency: string;
}

export function seedCart(): CartState {
  return {
    merchant_id: 'sonicstore',
    items: [{ sku: 'hp-001', name: 'SonicPods Headphones', qty: 1, unit_price: 199_900 }],
    currency: 'INR',
  };
}

export function cartAmount(cart: CartState): number {
  return cart.items.reduce((sum, i) => sum + i.qty * i.unit_price, 0);
}

export function toSnapshot(cart: CartState, now: number): CheckoutSnapshot {
  return {
    merchant_id: cart.merchant_id,
    items: cart.items.map((i) => ({ ...i })),
    amount_paise: cartAmount(cart),
    currency: cart.currency,
    fetched_at: now,
  };
}

// Demo control knob: sets the unit price of the first cart item.
export function setPrice(cart: CartState, amount_paise: number): void {
  const first = cart.items[0];
  if (!first) throw new Error('cart is empty');
  first.unit_price = amount_paise;
}
