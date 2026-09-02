import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { canonicalize } from 'json-canonicalize';
import type { CheckoutSnapshot, ProposedAction } from '../contracts/schemas.js';

// Canonical JSON (JCS, RFC 8785) + sha256/HMAC-SHA256 primitives.
// Pure functions only: no I/O, no clocks, no randomness.

export function canonicalJson(obj: unknown): string {
  return canonicalize(obj);
}

export function canonicalHash(obj: unknown): string {
  return createHash('sha256').update(canonicalJson(obj), 'utf8').digest('hex');
}

// PLAN.md §05: snapshot_hash binds the checkout state, NOT the fetch time.
export function snapshotHash(snapshot: CheckoutSnapshot): string {
  const { fetched_at: _omitted, ...bindingFields } = snapshot;
  return canonicalHash(bindingFields);
}

// PLAN.md §05: action_hash binds the full proposed action (incl. action_id,
// so byte-identical replays hash identically).
export function actionHash(action: ProposedAction): string {
  return canonicalHash(action);
}

export function signPayload(obj: unknown, key: string): string {
  return createHmac('sha256', key).update(canonicalJson(obj), 'utf8').digest('hex');
}

export function verifyPayload(obj: unknown, signature: string, key: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(signature)) return false;
  const expected = Buffer.from(signPayload(obj, key), 'hex');
  const got = Buffer.from(signature, 'hex');
  return expected.length === got.length && timingSafeEqual(expected, got);
}
