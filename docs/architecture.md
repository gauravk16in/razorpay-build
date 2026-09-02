# RupeeProof — Architecture Writeup

Condensed from `PLAN.md` (frozen 2 Sep 2026). External-API facts verified
against official Razorpay docs the same day (Fact Register F1–F9 in PLAN.md).

## Problem

A valid Razorpay API call is not necessarily an authorized transaction. Between
user intent and payment execution, amounts, merchants, carts, freshness, and
replay state can mutate — and an LLM cannot be the authority that catches it.

## Thesis

Authorization must bind to **exact transaction state**, not to intent prose.
RupeeProof binds a signed mandate to the hash of the exact approved checkout
snapshot and re-verifies at execution time against a freshly fetched snapshot.

## Components and boundaries

| Component | Role | Trust boundary |
|---|---|---|
| Intent Adapter (LLM + stub) | NL → constraints draft | Untrusted; schema-gated; no code path to executor (arch test I9) |
| Schema Gate | zod validation | Rejects/clarifies; never executes |
| Mandate Service | Issues HMAC-signed mandates binding constraints + approved snapshot hash | Signature covers immutable issuance fields only |
| Snapshot Fetcher | GET cart from **mandate-bound URL only** | Action-supplied URLs never consulted (SEC6) |
| Verifier | Pure `(mandate, action, snapshot, now) → Decision` | Sole allow/deny authority; fail closed |
| Executor | Single-use token → one Razorpay order | Token burned before any network call; receipt idempotency |
| Razorpay Adapter | Typed REST (`POST /v1/orders`, fetch) | No SDK; secrets injected; never logged |
| Webhook Endpoint | Raw-body HMAC verify, event-id dedupe | Record-only; zero authority |
| Ledger | Hash-chained JSONL | Append-only; tamper-evident; state = replay |

## Data flow (valid path)

1. User states intent; LLM drafts constraints (schema-validated).
2. User approves the exact cart → Mandate Service issues a signed mandate
   (`approved_snapshot_hash`, TTL 10 min).
3. Agent proposes an action. Verifier re-fetches the checkout snapshot from
   the mandate-bound merchant URL and checks: signature, lifecycle
   (consumed/expired/superseded), snapshot health (future/stale), merchant
   binding, field equality (amount/currency/items), cap, and **exact hash
   equality** with the approved snapshot.
4. ALLOW ⇒ single-use token ⇒ executor creates one Razorpay Test Mode order
   (`receipt = rp-<decision_id>`) ⇒ mandate consumed.
5. Webhooks (verified, deduped) link Razorpay events to the execution.
6. Every step appends to the hash-chained ledger: intent→mandate→decision→
   execution→webhook is one inspectable evidence chain.

DENY paths: every failure maps to a specific frozen reason code (18 codes),
and denied actions make **zero** Razorpay calls (asserted by gateway spy in
the adversarial suite).

## Failure model (summary)

Razorpay timeout/5xx → `EXECUTION_UNKNOWN`, receipt-based reconciliation · bad
webhook signature → 401 + REJECTED, no state change · duplicate webhook →
DUPLICATE record · out-of-order events → recorded without order assumptions ·
LLM garbage → clarify · tampered mandate → MANDATE_INVALID · checkout change →
CHECKOUT_CHANGED + re-approval path · any verifier error → DENY (fail closed) ·
ledger write failure → no decision, no execution. Full table: PLAN.md §07.

## Decision register (top entries)

Raw `fetch`+`node:crypto`, no Razorpay SDK (3 calls only) · hash-chained JSONL
ledger instead of a DB (evidence = state) · merchant as labeled fixture (demo
control) · HMAC mandates (single issuer-verifier in P0) · execution boundary =
order creation · webhook evidence REPLAYED by default (localhost delivery
blacklisted upstream) · verifier pure with injected clock (seeded harness) ·
JCS (RFC 8785) canonicalization for all hashes. Full register: PLAN.md §D1–D12.

## Evaluation design

- **Oracle**: per-trace expected verdict + reason-code set, declared by the
  seeded generator (12 attack/valid classes).
- **Baselines**: B2 amount-cap gate (deterministic), B1 LLM-as-judge
  (fail-open by design; numbers when LLM credentials available).
- **Metrics**: unsafe-forward (primary), valid-pass, false-denial, per-class
  detection, dedupe correctness, evidence completeness, latency.
- **Held-out**: generator is seed-parameterized; thresholds tuned on dev seeds
  only. All current numbers: seed 42, 1000 traces, SYNTHETIC label.
- Reproduce everything: `npm run eval` (regenerates `eval/report.md` +
  `CLAIMS.md` from committed artifacts).
