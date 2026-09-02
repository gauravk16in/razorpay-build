# RupeeProof — Architecture & Execution Plan

Derived 2 Sep 2026. Governing inputs: `PROJECT_BRIEF.md`, `CONSTITUTION.md`,
`razorpay-buildathon-research.html`, and Razorpay official docs (verified
2 Sep 2026, see Fact Register below). This plan is the frozen reference for
implementation agents. Constitution §9 applies: conflicts with this plan →
STOP, document, escalate.

## Fact Register (external behavior, verified)

| # | Fact | Label | Source |
|---|------|-------|--------|
| F1 | `POST https://api.razorpay.com/v1/orders`, HTTP Basic auth `key_id:key_secret`, JSON body `{amount, currency, receipt?, notes?}` | CONFIRMED | razorpay.com/docs/api/orders/create |
| F2 | `amount` = integer in smallest currency sub-unit (₹299 → `29900`) | CONFIRMED | same |
| F3 | `receipt`: ≤40 chars, ASCII, unique; **duplicate receipt rejected** — Razorpay-side idempotency | CONFIRMED | same ("Duplicate request" error) |
| F4 | Order response: `id` (`order_...`), `status` ∈ `created/attempted/paid`, `created_at`; `GET /v1/orders/:id` and `GET /v1/orders` exist | CONFIRMED | docs/api/orders |
| F5 | Webhook signature: `X-Razorpay-Signature` = HMAC-SHA256 hex, key = webhook secret, message = **raw body, unparsed** | CONFIRMED | docs/webhooks/validate-test |
| F6 | Duplicate detection: `x-razorpay-event-id` header, unique per event — official mechanism | CONFIRMED | same |
| F7 | Webhook events may arrive **out of order**; handlers must not assume ordering | CONFIRMED | same |
| F8 | Webhook delivery needs a public URL; `localhost` impossible; ngrok.io, webhook.site, loca.lt etc. **blacklisted**; Razorpay recommends `zrok` | CONFIRMED | same |
| F9 | Test-mode webhook setup OTP on dashboard: `754081` | CONFIRMED | same |
| F10 | Razorpay ships an official MCP server (40+ tools) | CONFIRMED (exists) | docs nav + research; tool schemas UNKNOWN — MCP is cut from P0 |
| F11 | Razorpay test keys available today | CONFIRMED | user, 2 Sep 2026 |
| F12 | Stack: TypeScript / Node 22 (v22.23.2 installed) | CONFIRMED | user, 2 Sep 2026 |
| F13 | AP2 schemas/signatures | UNKNOWN — not needed; wording stays "AP2-inspired" (Constitution §13) | — |
| F14 | User can record the 5-min video; repo will be made public | ASSUMED | — |

---

## 01_PROJECT_FREEZE

- **One-sentence definition**: RupeeProof is a Razorpay-native transaction
  verification layer that binds a signed user authorization to an exact
  checkout state, deterministically allows or denies any AI-proposed payment
  action before execution, and emits hash-chained evidence for every decision —
  demonstrated against Razorpay Test Mode.
- **Core user**: a developer/platform deploying AI purchasing agents on
  Razorpay (evaluation audience: Buildathon judges).
- **Core problem**: a valid Razorpay API call is not necessarily an authorized
  transaction; between intent and execution, amounts, merchants, carts, and
  replay state can mutate — and an LLM cannot be the authority that catches it.
- **Core capability**: exact transaction-state binding + deterministic
  pre-execution verification + tamper-evident decision evidence.
- **Success condition**: hero demo runs in ≤5 min — valid action creates a
  real Razorpay Test Mode order; amount mutation, merchant substitution,
  replay, and post-approval checkout change are each denied with machine-
  readable reason codes (checkout change → re-approval path shown); duplicate
  webhook deduplicated; quantitative evaluation vs two baselines published in
  `CLAIMS.md` with reproduction commands; every evidence artifact labeled
  `REAL_TEST_MODE` / `REPLAYED` / `SYNTHETIC` / `MODELLED`.
- **Explicitly excluded**: live mode / real money; completing checkout payment
  (execution boundary = order creation); full AP2; Razorpay MCP; multi-agent
  orchestration; voice; marketplace/discovery; dashboards/web UI; multi-user
  auth; refunds/payouts/disputes; production merchant integration (merchant is
  a labeled fixture).

## 02_REQUIREMENTS

**Functional**
- FR1 Parse natural-language purchase intent into a typed constraints object
  (LLM adapter output must pass schema validation; invalid → clarify, never
  execute).
- FR2 Present the exact checkout snapshot for user approval; on approval issue
  a signed mandate binding constraints + approved snapshot hash + expiry.
- FR3 Verify any proposed payment action deterministically against the mandate
  and a freshly fetched checkout snapshot → `Decision{verdict, reason_codes}`.
- FR4 On ALLOW, execute exactly one Razorpay Test Mode order create; `receipt`
  derived from decision id (Razorpay-side idempotency, F3).
- FR5 Ingest webhooks: verify signature on raw body (F5), dedupe by
  `x-razorpay-event-id` (F6), tolerate out-of-order events (F7), record only.
- FR6 Append every state change to a hash-chained JSONL ledger; full state
  rebuildable by replay; chain verifiable.
- FR7 Adversarial harness runs scripted attack scenarios through the real
  pipeline (stub LLM, fixture merchant, fake or live Razorpay) and asserts
  expected verdicts.
- FR8 Demo CLI runs the hero scenario end-to-end and prints evidence.

**Non-functional**
- NFR1 Verifier is a pure function: no I/O, injected clock, no imports of
  adapters. Offline-unit-testable (Constitution §5).
- NFR2 Verify latency p99 < 5 ms in-process.
- NFR3 Harness runs without network (SYNTHETIC mode) and is seed-reproducible.
- NFR4 App code ≤ ~2.5k LOC (§14 simplicity).
- NFR5 Fresh-machine setup: `npm install && npm test` ≤ 5 min.

**Security/safety**
- SEC1 No code path from the LLM module to the Razorpay adapter or executor
  (enforced by an architecture/dependency test).
- SEC2 Fail closed: any verification error, malformed input, missing evidence,
  or store failure ⇒ DENY, never silent proceed (§2).
- SEC3 Test keys via `.env` (gitignored); `.env.example` committed; no secrets
  or customer data in the repo (§4).
- SEC4 Webhook signature verified on the **raw** body before any JSON parse.
- SEC5 Mandate signatures compared constant-time; HMAC key from env.
- SEC6 Snapshot is fetched only from the merchant base URL recorded in the
  mandate, never from a URL supplied in the proposed action.

**Hackathon**
- HK1 Public GitHub repo: README (problem, architecture, quickstart, evidence
  labels, limitations), this plan, `CLAIMS.md`.
- HK2 5-minute pitch video showing the hero demo.
- HK3 Architecture writeup = README + §06 of this plan.
- HK4 Form answers prepared (track, problem, repo URL, video URL, "what broke").

**Demo** — DM1 valid action accepted + real order created; DM2 amount mutation
denied; DM3 merchant substitution denied; DM4 replay denied; DM5 checkout/price
change denied → re-approval → new mandate → retry allowed; DM6 duplicate
webhook processed once.

**Evaluation** — EV1 adversarial suite ≥10 scenario classes, seeded volume
traces; EV2 baselines B1 (LLM-judge gate) and B2 (amount-cap gate) on the same
harness; EV3 metrics below; EV4 labeled intent corpus ≥40 entries; EV5 every
number in `CLAIMS.md` with reproduction command and label.

## 03_TRUST_MODEL

| Component | Trusts | Must verify | Authority | Forbidden |
|---|---|---|---|---|
| User | — | the presented checkout snapshot before approving | authorizes (approval = mandate issuance) | — |
| Intent Adapter (LLM) | nothing | nothing — its output is untrusted | none over execution | calling executor/Razorpay adapter; writing ledger; emitting non-schema output |
| Schema Gate | zod schemas | LLM output shape; value sanity (positive amount, known currency) | reject/clarify | passing unvalidated data downstream |
| Mandate Service | HMAC key (env), approved snapshot, schema-gated constraints | cap constraint at issuance (amount ≤ max) | issue/verify/supersede mandates | executing |
| Snapshot Fetcher | TLS, merchant base URL **from mandate only** (allowlist) | response schema; freshness fields | fetch + canonicalize + hash | following action-supplied URLs |
| **Verifier** | mandate signature, ledger state, injected clock | action vs mandate, fetched snapshot vs approved hash, expiry, replay status, binding rules | **sole allow/deny** | network mutation; trusting LLM or action claims |
| Executor | single-use ExecutionToken + matching ALLOW decision | token↔decision↔action-hash binding; token unused & unexpired | none (mechanical) | executing without token; reusing receipt |
| Razorpay Adapter | env credentials, TLS | nothing semantic | none | being imported outside executor (arch test) |
| Razorpay (Test Mode) | — | — | creates orders; sends webhooks | — |
| Webhook Endpoint | nothing inbound | raw-body HMAC signature; event-id novelty | record facts to ledger | approving/executing; assuming event order |
| Merchant Fixture | — (it is SYNTHETIC) | — | serve + mutate demo cart | being treated as trusted data by verifier |
| Ledger | local fs | hash chain on load | append-only record | updates/deletes |

## 04_INVARIANTS

Machine-testable statements (each maps to ≥1 harness/test assertion):

- I1 Every `ExecutionRecord` links to exactly one `Decision` with
  `verdict=ALLOW` and equal `action_hash`. (No execution without allow.)
- I2 If action.merchant ≠ mandate.merchant, or action.amount ≠ snapshot.amount,
  or action.currency ≠ mandate.currency, or action items hash ≠ snapshot items
  hash ⇒ verdict = DENY.
- I3 Per mandate: at most one execution. Second attempt ⇒ DENY
  `MANDATE_CONSUMED`.
- I4 `now > mandate.expires_at` ⇒ DENY `MANDATE_EXPIRED`.
- I5 `fetched_snapshot.hash ≠ mandate.approved_snapshot_hash` ⇒ DENY
  `CHECKOUT_CHANGED` (+ `next_action=REQUIRE_REAPPROVAL`).
- I6 Every decision has verdict ∈ {ALLOW,DENY}, ≥1 reason code, mandate id,
  both snapshot hashes, timestamp, latency.
- I7 Per `x-razorpay-event-id`: processed at most once; repeat ⇒ `DUPLICATE`.
- I8 Invalid webhook signature ⇒ HTTP 401 + `REJECTED` record; no state change.
- I9 Static dependency test: no import path `intent-adapter → executor` or
  `intent-adapter → razorpay-adapter`.
- I10 Verifier exception/timeout ⇒ DENY `VERIFIER_ERROR` (fail closed).
- I11 Ledger chain verifies: `entry[i].prev_hash == entry[i-1].entry_hash`;
  tamper ⇒ detection on load.
- I12 Snapshot fetched from URL ≠ mandate.merchant_base_url ⇒ DENY
  `MERCHANT_BINDING_VIOLATION`.
- I13 Tampered/invalid mandate signature ⇒ DENY `MANDATE_INVALID`
  (constant-time compare).

Reason-code enum (frozen): `OK`, `AMOUNT_MISMATCH`, `MERCHANT_MISMATCH`,
`CURRENCY_MISMATCH`, `ITEMS_MISMATCH`, `OVER_LIMIT`, `CHECKOUT_CHANGED`,
`STALE_SNAPSHOT`, `SNAPSHOT_UNAVAILABLE`, `SNAPSHOT_FROM_FUTURE`,
`MANDATE_EXPIRED`, `MANDATE_CONSUMED`, `MANDATE_INVALID`,
`MERCHANT_BINDING_VIOLATION`, `REPLAY_DETECTED`, `VERIFIER_ERROR`,
`EXECUTION_FAILED`, `EXECUTION_UNKNOWN`.

## 05_DATA_MODEL

All entities are zod schemas (frozen in T03). Amounts integer paise; timestamps
epoch ms; hashes lowercase hex sha256 over JCS-canonical JSON (RFC 8785).

- **CheckoutSnapshot** `{merchant_id, items[{sku,name,qty,unit_price}], amount_paise, currency, fetched_at}` →
  `snapshot_hash = sha256(jcs(snapshot minus fetched_at))`.
- **Mandate** `{mandate_id, constraints{merchant_id, merchant_base_url, max_amount_paise, currency}, approved_snapshot_hash, issued_at, expires_at, nonce, status}` + `signature` (HMAC-SHA256 over JCS of all fields).
  Lifecycle: `ACTIVE → CONSUMED | EXPIRED | SUPERSEDED` (SUPERSEDED on
  re-approval: new mandate issued, old one closed).
- **ProposedAction** `{action_id, mandate_id, merchant_id, amount_paise, currency, items, proposed_at}` → `action_hash`.
- **Decision** `{decision_id, mandate_id, action_hash, verdict, reason_codes[], approved_snapshot_hash, fetched_snapshot_hash, decided_at, latency_ms, next_action?}`.
- **ExecutionToken** `{token_id, decision_id, expires_at, used}` — single-use.
- **ExecutionRecord** `{execution_id, decision_id, receipt ("rp-"+decision_id, ≤40 chars), razorpay_order_id?, request_hash, response?, status: CREATED|FAILED|UNKNOWN, executed_at}`.
- **WebhookEventRecord** `{event_id, event_type, signature_valid, processed: PROCESSED|DUPLICATE|REJECTED, linked_order_id?, raw_hash, received_at}`.
- **LedgerEntry** `{seq, type, payload, prev_hash, entry_hash, at}` — genesis
  `prev_hash = "0"*64`. Ledger replay derives all state.

## 06_ARCHITECTURE

Stack (D1): TypeScript, Node 22, npm. Deps: `zod`, `fastify`,
`json-canonicalize`; dev: `typescript`, `tsx`, `vitest`, `@types/node`.
No Razorpay SDK (D2: only 3 REST calls needed — `fetch` + `node:crypto`;
adapter interface keeps SDK swap reversible). No database server (D3:
hash-chained JSONL ledger is the store). Commands (recorded here per AGENTS.md
until scaffold lands): `npm test` = vitest run · `npm run typecheck` = tsc
--noEmit · `npm run demo` = tsx src/demo/cli.ts · gate order: typecheck → test
→ demo.

```mermaid
flowchart LR
  subgraph UNTRUSTED["UNTRUSTED ZONE"]
    U[User] -->|NL intent| LLM[Intent Adapter<br/>LLM]
    LLM -->|draft constraints| SG[Schema Gate<br/>zod]
    ATT[Attacker /<br/>Harness] -.->|mutated/replayed action| PA[ProposedAction]
  end
  subgraph CORE["DETERMINISTIC CORE (pure, offline-testable)"]
    SG --> MS[Mandate Service<br/>HMAC sign/verify]
    U -->|approves exact cart| MS
    VER[Verifier<br/>pure decide()]
    EX[Executor<br/>single-use token]
    MS --> VER
    PA --> VER
    VER -->|ALLOW + token| EX
    VER -->|DENY + reason codes| LG
  end
  subgraph ADAPTERS["ADAPTERS (only I/O)"]
    SF[Snapshot Fetcher]
    RZA[Razorpay Adapter<br/>fetch REST]
    WH[Webhook Endpoint<br/>raw-body HMAC, dedupe]
    MF[Merchant Fixture<br/>SYNTHETIC]
  end
  SF -->|fresh snapshot| VER
  MF -->|cart JSON over HTTP| SF
  EX --> RZA
  RZA -->|POST /v1/orders| RZP[(Razorpay<br/>Test Mode)]
  RZP -.->|webhook| WH
  MS --> LG[(Hash-chained<br/>JSONL Ledger)]
  VER --> LG
  EX --> LG
  WH --> LG
  LG --> RPT[Evidence report /<br/>CLAIMS.md]
```

Component cards (WHY / TRUSTS / GUARANTEES / FAILURE / TEST / REMOVABLE?):

1. **Intent Adapter** — AI track requires LLM in loop / nothing / schema-shaped
   draft or error / hallucination → gate rejects / corpus eval + stub / NO
   (track requirement).
2. **Schema Gate** — LLM output is untrusted / schemas / only valid constraints
   pass / invalid input → clarify / property tests / NO (SEC1).
3. **Mandate Service** — authorization artifact must exist / key, snapshot /
   signed, expiring, single-use mandates / bad signature on load → verify fail /
   unit tests / NO (core).
4. **Snapshot Fetcher** — checkout state must be re-read at execution time /
   mandate URL / canonical hashed snapshot / merchant down → DENY
   `SNAPSHOT_UNAVAILABLE` / fixture tests / NO (state binding).
5. **Verifier** — deterministic authorization (Constitution §1) / §03 /
   Decision with reason codes / any error → DENY / exhaustive unit + harness /
   NO (the product).
6. **Executor+Token** — separates decision from execution; idempotent retry /
   token+decision / ≤1 Razorpay call per allow / API error → FAILED record /
   integration tests / NO.
7. **Razorpay Adapter** — real test-mode path is the spine / env, TLS / typed
   responses / timeout → UNKNOWN + reconcile / fake + live smoke / NO.
8. **Webhook Endpoint** — dedupe demo + event linkage / nothing inbound /
   verified, deduped records / bad sig → 401 / crafted-HMAC tests / NO (DM6).
9. **Merchant Fixture** — need controllable checkout for DM5 / — / cart JSON +
   price mutation admin route / — / route tests / NO (demo control; labeled
   SYNTHETIC).
10. **Ledger** — evidence + state in one artifact / local fs / append-only,
    verifiable chain / write fail → fail closed / tamper tests / NO.
11. **Demo CLI / Harness** — proof + evaluation / — / seeded runs / — /
    self-asserting / NO (EV1).
12. **Baselines B1/B2** — brief requires comparison vs simpler systems / — /
    same Gate interface / — / harness / NO (EV2).
13. **Report/CLAIMS generator** — §7 evidence-before-claims / ledger /
    reproducible numbers / — / golden-file test / NO (EV5).

Removed at the quality gate (do not re-add): SQLite/DB server, Razorpay SDK,
msw, web dashboard, MCP integration, payment-completion flow, Docker, ESLint/
Prettier (tsc strict + vitest suffice for 3 days).

## 07_FAILURE_MODEL

| Failure | Detection | Safe response | Evidence |
|---|---|---|---|
| Razorpay timeout/5xx on create | fetch error/timeout in adapter | no retry loop; record `EXECUTION_UNKNOWN`; reconcile via `GET /v1/orders` matching receipt | ExecutionRecord + reconciliation note |
| Ambiguous: order maybe created | reconcile finds receipt | link existing order; still ≤1 execution (I3 holds via receipt idempotency F3) | reconciled record |
| Webhook bad signature | HMAC mismatch (raw body) | HTTP 401, no state change | `REJECTED` record |
| Duplicate webhook | seen `x-razorpay-event-id` | no reprocessing | `DUPLICATE` record |
| Out-of-order webhook | event_type vs known state | record fact only; never infer | ordered-by-arrival records |
| LLM malformed output | zod parse fails | clarify; no mandate issued | gate rejection record |
| Mandate bytes tampered | HMAC verify fail | DENY `MANDATE_INVALID` | decision record |
| Checkout changed post-approval | snapshot hash mismatch | DENY `CHECKOUT_CHANGED`, offer re-approval | decision + both hashes |
| Merchant fixture unreachable | fetch error | DENY `SNAPSHOT_UNAVAILABLE` | decision record |
| Snapshot timestamp in future | `fetched_at > now` | DENY `SNAPSHOT_FROM_FUTURE` | decision record |
| Ledger write failure | fs error | abort decision path — no execution possible | n/a (fail closed) |
| Crash after create, before record | startup reconciliation | match receipt via fetch-all; close `UNKNOWN` | reconciliation log |
| Tunnel down (optional live webhook) | no delivery | fall back to REPLAYED payloads | label honesty |

## 08_EVALUATION

- **Datasets**: (a) Adversarial suite — 12 scenario classes (valid, amount ±,
  merchant swap, currency swap, items mutation, over-limit, replay,
  expired mandate, stale snapshot, checkout change, tampered mandate, bad
  webhook signature, duplicate webhook, out-of-order webhook) → fixed core set
  + seeded generator producing ~1,000 SYNTHETIC traces. (b) REAL_TEST_MODE
  subset: ~8 live runs (valid creates + denies that never reach Razorpay —
  denied count must equal zero Razorpay calls, asserted via adapter spy).
  (c) Intent corpus: ≥40 labeled NL intents (SYNTHETIC, gold constraints).
- **Oracle**: expected verdict per scenario declared in scenario spec;
  evidence-completeness oracle = decision schema validation; denied-scenario
  oracle includes "zero Razorpay calls made".
- **Baselines**: B2 amount-cap-only gate (deterministic, trivially misses
  merchant/replay/checkout classes); B1 LLM-as-judge gate (same inputs, LLM
  verdict, temp 0, one model, labeled with model name). Same Gate interface,
  same harness.
- **Metrics**: unsafe-forward rate (primary), valid-action pass rate,
  false-denial rate, per-class detection rate, webhook dedupe correctness,
  evidence completeness %, verify latency p50/p99; intent extraction accuracy
  + unsafe-under-constraint rate.
- **Held-out strategy**: generator seeds split dev/holdout; TTLs and wording
  tuned only on dev; holdout run once for reported numbers; holdout uses
  unseen merchants/amounts/phrasings.
- **Limitations (must appear in README/video)**: merchant is synthetic;
  test mode only; payment completion not exercised; corpus small; B1 is one
  model one run; latency is in-process; no real fraud/GMV claims (§7, brief).

## 09_CRITICAL_PATH

Empty repo → first end-to-end demonstrated capability
("valid action → real Razorpay Test Mode order + evidence record"):

`T01 verify+smoke → T02 scaffold → T03 contracts → T04 hashing/HMAC →
T05 ledger → T06 mandate → T07 verifier → T09 razorpay adapter →
T08 executor → happy-path integration test (real order, REAL_TEST_MODE)`.

Everything after that adds evidence, attacks, and submission polish around an
already-working spine.

## 10_IMPLEMENTATION_PHASES

- **P0 Foundations** (T01–T03): facts, keys smoke, scaffold, contracts.
  Unblocks everything; contracts must freeze before parallel work.
- **P1 Verification core** (T04–T08): pure, offline, fully tested — the
  differentiator; no network needed.
- **P2 Adapters** (T09–T12): Razorpay, merchant fixture, webhook, intent.
  Parallel with P1 once contracts freeze.
- **P3 Evidence & evaluation** (T13–T16): harness, baselines, corpus, metrics
  + CLAIMS.md.
- **P4 Demo & submission** (T17–T19): demo CLI, README/writeup, video + repo
  hygiene. Starts day 3 morning regardless of P3 leftovers (cut order §13).

## 11_TASK_GRAPH

Contracts (T03) freeze first; each task sized 30–90 min for one coding agent.

- **T01** · GOAL: pin Razorpay facts + prove keys work · DEP: none · INPUT:
  docs (F1–F9), user test keys · OUTPUT: `docs/razorpay-facts.md` + one real
  test order id (first REAL_TEST_MODE artifact) · FILES: docs/ · TEST-FIRST:
  n/a (spike) · ACCEPT: `curl` create-order returns `order_...` id; facts file
  cites URLs · VERIFY: `curl -u $RZP_KEY_ID:$RZP_KEY_SECRET -X POST
  https://api.razorpay.com/v1/orders -d '{"amount":10000,"currency":"INR","receipt":"rp-t01-smoke"}'` · OOS: any code · PARALLEL: YES
- **T02** · GOAL: repo scaffold · DEP: user confirms dedicated git repo
  (home-dir git trap — AGENTS.md) · INPUT: PLAN.md stack · OUTPUT: package.json,
  tsconfig(strict), vitest config, dir layout, .gitignore(incl .env, var/),
  .env.example, npm scripts · FILES: root, src/ · TEST-FIRST: trivial smoke
  test passes · ACCEPT: `npm install && npm test && npm run typecheck` green ·
  VERIFY: those commands · OOS: any domain code · PARALLEL: NO (everything
  depends on it)
- **T03** · GOAL: freeze contracts · DEP: T02 · INPUT: §04/§05 · OUTPUT: zod
  schemas for all entities, reason-code enum, Gate/Adapter/Ledger interfaces,
  JCS helper signature · FILES: src/contracts/ · TEST-FIRST: round-trip valid
  fixtures; reject invalid (bad enum, negative amount) · ACCEPT: schema tests
  green; interfaces compile against stub impls · VERIFY: `npm test
  tests/contracts` · OOS: business logic · PARALLEL: NO (freeze gate)
- **T04** · GOAL: canonical hash + HMAC utils · DEP: T03 · INPUT: schemas ·
  OUTPUT: `canonicalHash(obj)`, `signMandate/verifyMandate` (constant-time) ·
  FILES: src/core/crypto.ts · TEST-FIRST: known-vector hash stability; tamper
  detection; cross-run determinism · ACCEPT: vectors pass · VERIFY: `npm test
  tests/core/crypto` · OOS: mandate logic · PARALLEL: YES
- **T05** · GOAL: hash-chained JSONL ledger · DEP: T03 · INPUT: LedgerEntry
  schema · OUTPUT: append/replay/verify-chain API · FILES: src/core/ledger.ts ·
  TEST-FIRST: append→replay state equality; flipped byte detected; genesis
  check · ACCEPT: I11 test green · VERIFY: `npm test tests/core/ledger` · OOS:
  querying/indexing beyond maps · PARALLEL: YES
- **T06** · GOAL: mandate service · DEP: T04, T05 · INPUT: constraints +
  approved snapshot · OUTPUT: issue/verify/consume/supersede + status machine ·
  FILES: src/core/mandate.ts · TEST-FIRST: expiry, consume-once (I3), supersede
  on re-approval, signature required · ACCEPT: I3, I4, I13 unit tests green ·
  VERIFY: `npm test tests/core/mandate` · OOS: verification of actions ·
  PARALLEL: YES (after T04/T05)
- **T07** · GOAL: verifier (pure) · DEP: T03, T04 · INPUT:
  `(mandate, action, fetchedSnapshot, now)` · OUTPUT: `Decision` · FILES:
  src/core/verifier.ts · TEST-FIRST: one test per invariant I1–I6, I10, I12,
  I13; unknown-input fail-closed · ACCEPT: all green; p99 <5ms micro-bench ·
  VERIFY: `npm test tests/core/verifier` · OOS: I/O, merchant fetch ·
  PARALLEL: YES (after T03)
- **T08** · GOAL: executor + single-use token · DEP: T03, T09-interface ·
  INPUT: Decision(ALLOW) · OUTPUT: token consume → adapter call →
  ExecutionRecord · FILES: src/core/executor.ts · TEST-FIRST: no token → throw;
  reused token → throw; receipt = `rp-<decision_id>` ≤40 chars · ACCEPT: I1
  guard test green · VERIFY: `npm test tests/core/executor` · OOS: retry
  policy beyond reconcile hook · PARALLEL: YES
- **T09** · GOAL: Razorpay adapter + fake · DEP: T01, T03 · INPUT:
  `{amount_paise, currency, receipt, notes}` · OUTPUT: `createOrder`,
  `fetchOrder`, `fetchAllOrders(reconcile)`; `FakeRazorpay` (in-memory,
  receipt-idempotent) · FILES: src/adapters/razorpay.ts · TEST-FIRST: fake
  honors receipt idempotency; adapter maps F1–F4 fields; live smoke behind
  `RZP_LIVE=1` · ACCEPT: fake tests green + 1 real order (REAL_TEST_MODE) ·
  VERIFY: `RZP_LIVE=1 npm test tests/adapters/razorpay.live` · OOS: payments,
  refunds, other endpoints · PARALLEL: YES
- **T10** · GOAL: merchant fixture · DEP: T02 · INPUT: seed cart · OUTPUT:
  fastify routes `GET /merchant/cart`, `POST /merchant/__admin__/price`;
  labeled SYNTHETIC · FILES: src/merchant/ · TEST-FIRST: cart schema valid;
  price change changes snapshot hash · ACCEPT: route tests green · VERIFY:
  `npm test tests/merchant` · OOS: real merchant semantics · PARALLEL: YES
- **T11** · GOAL: webhook endpoint · DEP: T03, T05 · INPUT: raw POST + headers
  · OUTPUT: verify (F5) → dedupe (F6) → record; 401 on bad sig · FILES:
  src/webhooks/ · TEST-FIRST: crafted valid/invalid HMAC; duplicate event-id;
  out-of-order types; raw-body (no pre-parse!) regression · ACCEPT: I7, I8
  green · VERIFY: `npm test tests/webhooks` · OOS: live tunnel setup ·
  PARALLEL: YES
- **T12** · GOAL: intent adapter + stub · DEP: T03 · INPUT: NL string ·
  OUTPUT: OpenAI-compatible chat call → zod-validated constraints or
  CLARIFY; `StubIntent` for tests · FILES: src/adapters/intent.ts ·
  TEST-FIRST: stub deterministic; invalid LLM JSON → clarify (never throw
  into core); arch test: no import executor/razorpay (I9) · ACCEPT: tests
  green · VERIFY: `npm test tests/adapters/intent` · OOS: prompt tuning ·
  PARALLEL: YES
- **T13** · GOAL: adversarial harness · DEP: T06, T07, T08, T09, T10, T11 ·
  INPUT: scenario specs (12 classes §08) · OUTPUT: runner executing full
  pipeline in-process, asserting verdicts + invariants + zero-Razorpay-on-deny;
  seeded trace generator (~1,000) · FILES: src/harness/ · TEST-FIRST: each
  class has expected-verdict spec; generator deterministic per seed · ACCEPT:
  all classes pass vs RupeeProof gate · VERIFY: `npm run harness` · OOS:
  metrics formatting · PARALLEL: NO (integration point)
- **T14** · GOAL: baselines B1+B2 · DEP: T13, T12 · INPUT: Gate interface ·
  OUTPUT: cap-only gate; LLM-judge gate (temp 0, model named) · FILES:
  src/baselines/ · TEST-FIRST: B2 expected failures on merchant/replay classes ·
  ACCEPT: both run under harness · VERIFY: `npm run harness -- --gate=b2` ·
  OOS: extra baselines · PARALLEL: YES (after T13)
- **T15** · GOAL: metrics + CLAIMS.md · DEP: T13, T14 · INPUT: ledger/decision
  artifacts · OUTPUT: `eval/report.md` + `CLAIMS.md` with reproduction commands
  + labels · FILES: eval/, CLAIMS.md · TEST-FIRST: golden-file metric
  computation on fixture ledger · ACCEPT: every number traceable to artifact ·
  VERIFY: `npm run eval` · OOS: charts · PARALLEL: NO
- **T16** · GOAL: intent corpus + extraction eval · DEP: T12 · INPUT: ≥40 YAML
  cases + gold constraints · OUTPUT: accuracy + unsafe-under-constraint metrics
  (SYNTHETIC label) · FILES: eval/corpus/, src/adapters/intent.eval.ts ·
  TEST-FIRST: corpus schema-valid; gold parse · ACCEPT: report generated ·
  VERIFY: `npm run eval:intent` · OOS: corpus >60 entries · PARALLEL: YES
  (after T12)
- **T17** · GOAL: hero demo CLI · DEP: T08, T09, T10, T11, T13 · INPUT: .env ·
  OUTPUT: `npm run demo` — DM1–DM6 with printed evidence chain; replayed
  webhooks (labeled) · FILES: src/demo/ · TEST-FIRST: demo asserts its own
  expected verdicts; dry-run mode in tests · ACCEPT: ≤5 min run, all six beats
  pass · VERIFY: `npm run demo` · OOS: UI, colors beyond readable · PARALLEL: NO
- **T18** · GOAL: README + architecture writeup · DEP: T15, T17 · INPUT:
  PLAN.md, CLAIMS.md · OUTPUT: README (problem, architecture diagram,
  quickstart, labels legend, limitations, reproduction) · FILES: README.md,
  docs/ · TEST-FIRST: quickstart commands executed fresh · ACCEPT: every claim
  matches CLAIMS.md · VERIFY: follow README on clean checkout · OOS: marketing
  prose · PARALLEL: NO
- **T19** · GOAL: submission pack · DEP: T17, T18 · INPUT: form requirements
  (research §02) · OUTPUT: video script + recorded video (user), form answers,
  secrets scan, public repo · FILES: docs/submission.md · TEST-FIRST: scan finds
  no secrets (`git grep -i rzp_test` etc. after history rewrite check) ·
  ACCEPT: form fields complete; repo public-clean · VERIFY: manual + scan
  output · OOS: video editing beyond single take · PARALLEL: NO
- **T20 (stretch, first cut)** · GOAL: live webhook via zrok (REAL_TEST_MODE
  delivery) + MCP recon notes · DEP: T11, T19 · INPUT: zrok · OUTPUT: one live
  delivered event record · FILES: docs/ · TEST-FIRST: n/a · ACCEPT: labeled
  artifact · VERIFY: manual · OOS: MCP integration · PARALLEL: YES

## 12_PARALLELIZATION

- After T02: T03 alone (freeze gate — nothing parallel with it).
- After T03: {T04, T05} ∥ → then max width 6: {T06, T07, T09, T10, T11, T12}
  ∥ (disjoint dirs: core/mandate, core/verifier, adapters/razorpay, merchant/,
  webhooks/, adapters/intent). T08 after T09-interface stub exists.
- Join points: T13 (needs 06,07,08,09,10,11) → then {T14, T16} ∥ → T15 →
  T17 → {T18, T19} sequential-ish, T20 anytime after T11.
- Two agents max is realistic for one reviewer; assign by directory ownership.

## 13_CUT_ORDER

1. T20 (zrok live webhook, MCP recon) — pure stretch.
2. Live LLM in demo → stub/pre-recorded extraction (demo still "AI-initiated"
   via corpus evidence).
3. B1 LLM-judge baseline (keep B2 — near-zero cost, still satisfies
   "outperform simpler baselines").
4. T16 intent corpus eval (drop extraction metrics from CLAIMS).
5. Trace volume 1,000 → 100; never drop a scenario *class*.
6. Video polish → single-take recording.
   **Never cut**: T07 verifier, T13 core attack classes, one real test-mode
   order (T08+T09), T05 ledger evidence, T18 README honesty labels.

## 14_TOP_RISKS

1. **Time overrun / scope creep** (3-day deadline). Mitigation: demo-first
   critical path (§09), cut order (§13), P4 starts day 3 morning no matter
   what. Early signal: P1 not green by end of day 1.
2. **Webhook delivery friction** (CONFIRMED F8: localhost impossible, ngrok
   blacklisted). Mitigation: REPLAYED/SYNTHETIC delivery is the default
   evidence; zrok demoted to stretch (T20). No schedule risk to DM6.
3. **LLM flakiness** in extraction or live demo. Mitigation: stub default,
   seeded corpus, temp 0, pre-recorded fallback; harness never needs network.
4. **Over-claiming** (AP2-compatible, "prevents real fraud"). Mitigation:
   CLAIMS.md gate (§7), label discipline (§8), "AP2-inspired" wording (§13),
   README limitations section mandatory.
5. **Secrets/git accident** (home-dir repo trap; test keys leak). Mitigation:
   dedicated repo confirmed before T02, .gitignore first commit, pre-public
   secrets scan in T19, never commit `.env`.

## 15_FIRST_THREE_TASKS

1. **T01 — Razorpay fact-pin + key smoke (now, ~30 min).** Confirm F1–F9
   against docs; create one real test order via curl with the user's keys;
   write `docs/razorpay-facts.md`. Output doubles as first REAL_TEST_MODE
   artifact. If keys fail → stop, escalate (blocks everything real).
2. **T02 — Dedicated repo + scaffold (~60 min).** Get user confirmation for
   git init inside `/Users/kr/razorpay-build` (home-dir trap), then npm
   scaffold: TS strict, vitest, tsx, zod, fastify, json-canonicalize, scripts,
   .gitignore, .env.example. Gate: `npm install && npm test && npm run
   typecheck` green.
3. **T03 — Contracts freeze (~60–90 min).** All zod schemas from §05,
   reason-code enum from §04, Gate/Adapter/Ledger interfaces. Round-trip and
   rejection tests. Nothing else starts until this merges — every parallel
   task depends on it.

---

## Decision Register

| ID | Decision | Alternatives | Reason | Tradeoff | Reversibility | Evidence |
|----|----------|--------------|--------|----------|---------------|----------|
| D1 | TS/Node 22, zod+vitest+tsx+fastify | Python 3.14 stack | user choice; both verified viable | Fastify raw-body config care | low (3-day scope) | F12 |
| D2 | Raw `fetch`+`crypto`, no Razorpay SDK | official SDK | only 3 calls; transparency; fewer deps | re-implement tiny wrappers | high (adapter) | F1–F5 |
| D3 | Hash-chained JSONL ledger as store | SQLite/better-sqlite3 | evidence=state; zero native deps; demo-readable | no SQL queries | medium | §14 |
| D4 | Merchant = labeled fixture | real merchant integration | control price mutation (DM5); no 3rd party | synthetic merchant limitation | medium | brief |
| D5 | Webhook evidence REPLAYED/SYNTHETIC; zrok stretch | live tunnel default | F8: localhost impossible, ngrok blacklisted | less "live" footage | high | F8 |
| D6 | HMAC-signed mandate (symmetric) | asymmetric/AP2-style signatures | single issuer-verifier in P0; simpler; §14 | no third-party verifiability | medium | §13 |
| D7 | `receipt = rp-<decision_id>` | random receipt | Razorpay-side idempotency (F3) backs I3 | ≤40-char constraint | high | F3 |
| D8 | Execution boundary = order creation | full checkout payment | payment needs browser/test-card flow; webhooks via replay instead | payment.captured evidence is replayed | medium | F4, F8 |
| D9 | Verifier pure, injected clock | service-style verifier | offline tests, seeded harness (§5) | plumbing params | high | Constitution |
| D10 | Single Fastify app hosts merchant + webhook | two processes | fewer moving parts; boundary stays logical (verifier distrusts merchant data either way) | boundary less visual | high | §14 |
| D11 | JCS (RFC 8785) via `json-canonicalize` | hand-rolled stable stringify | canonicalization bugs break hash binding silently | +1 tiny dep | high | T04 tests |
| D12 | Razorpay keys ready; no signup task | — | user confirmed | — | — | F11 |
