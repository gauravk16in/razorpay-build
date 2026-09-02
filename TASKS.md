# RupeeProof — Executable Task Graph

Compiled from `PLAN.md` (frozen). Coding agents execute these cards exactly.
Conflicts with `PLAN.md`/`CONSTITUTION.md` → STOP, escalate (Constitution §9).

## Global conventions (apply to every task)

- **File discipline**: a task may create/modify ONLY its FILES_ALLOWED_TO_CHANGE.
  Anything else is forbidden, including `src/contracts/**` after T03 freezes it.
- **Git**: no `git` mutations without explicit user confirmation (repo root trap
  — see AGENTS.md). Never commit `.env` or secrets.
- **Done definition**: TESTS_TO_WRITE_FIRST are written and seen failing first,
  then implementation, then: `npm run typecheck` green + task VERIFICATION
  COMMANDS green + EXPECTED OBSERVABLE RESULT matches (Constitution §11).
- **Labels**: any produced evidence artifact carries a label:
  `REAL_TEST_MODE` | `REPLAYED` | `SYNTHETIC` | `MODELLED` (§8).
- **Secrets**: only via `process.env` (`.env`, gitignored). Live Razorpay calls
  only in files/tests gated by `RZP_LIVE=1`; default `npm test` = zero network.
- **Amounts**: integer paise. **Time**: epoch ms, injected `now` — never
  `Date.now()` inside `src/core/**`. **Hashes**: sha256 hex over JCS (RFC 8785)
  via `json-canonicalize`.
- **Layout**: `src/{contracts,core,adapters,merchant,webhooks,harness,baselines,
  metrics,demo}`, `tests/**` mirrors src, `eval/{corpus,artifacts,report.md}`,
  `var/` (gitignored runtime), `docs/`.

---

## T01 — Pin Razorpay facts; smoke-test live keys

- TASK_ID: T01
- OBJECTIVE: Verify Razorpay orders/webhook facts against official docs and
  prove the user's test keys work by creating one real test order.
- PRECONDITIONS: user test keys in hand (F11). No repo code required.
- FILES_ALLOWED_TO_CHANGE: `docs/razorpay-facts.md` (new)
- FILES_FORBIDDEN_TO_CHANGE: everything else (no package.json, no src)
- INPUT CONTRACT: `RZP_KEY_ID`, `RZP_KEY_SECRET` (test mode); PLAN.md Fact
  Register F1–F9.
- OUTPUT CONTRACT: `docs/razorpay-facts.md` = table {fact, doc URL, verified
  via, result}; plus one created `order_...` id recorded as first
  `REAL_TEST_MODE` artifact (no secrets in file).
- TESTS_TO_WRITE_FIRST: none (spike/verification task).
- IMPLEMENTATION REQUIREMENTS: curl or `fetch`; create order
  `{amount:10000, currency:"INR", receipt:"rp-t01-smoke"}`; confirm F3 by
  re-sending same receipt and observing duplicate rejection; record both
  responses (redact nothing — responses contain no secrets).
- ACCEPTANCE TESTS: (1) create returns HTTP 200 + `id` starting `order_`;
  (2) duplicate receipt returns 400 duplicate error; (3) facts file contains
  F1–F9 each with a URL and outcome.
- VERIFICATION COMMANDS: `curl -u "$RZP_KEY_ID:$RZP_KEY_SECRET" -X POST
  https://api.razorpay.com/v1/orders -H 'content-type: application/json' -d
  '{"amount":10000,"currency":"INR","receipt":"rp-t01-smoke"}'` (run twice)
- EXPECTED OBSERVABLE RESULT: first run → `"id": "order_..."`; second run →
  400 `"Duplicate request"`; `docs/razorpay-facts.md` exists with 9 rows.
- NEXT_TASKS_UNLOCKED: T09

## T02 — Initialize dedicated repo + TypeScript scaffold

- TASK_ID: T02
- OBJECTIVE: Create the buildable project skeleton with strict TS tooling.
- PRECONDITIONS: **user confirms dedicated `git init` in
  `/Users/kr/razorpay-build`** (home-dir trap). Node 22 present (F12).
- FILES_ALLOWED_TO_CHANGE: `package.json`, `package-lock.json`, `tsconfig.json`,
  `vitest.config.ts`, `.gitignore`, `.env.example`, `src/**` (empty structure +
  `src/index.ts` placeholder), `tests/smoke.test.ts`, `.git/` (via init)
- FILES_FORBIDDEN_TO_CHANGE: `PLAN.md`, `CONSTITUTION.md`, `PROJECT_BRIEF.md`,
  `AGENTS.md`, `TASKS.md`, `docs/**`
- INPUT CONTRACT: PLAN.md §06 stack (D1); Global conventions layout.
- OUTPUT CONTRACT: scripts (all pre-declared here; no later task edits
  package.json): `test`=`vitest run`, `typecheck`=`tsc --noEmit`,
  `harness`=`tsx src/harness/cli.ts`, `eval`=`tsx src/metrics/report.ts`,
  `eval:intent`=`tsx src/adapters/intent.eval.ts`, `demo`=`tsx src/demo/cli.ts`
  (targets created by their owning tasks; invoking early just errors); deps
  exactly: `zod fastify json-canonicalize`; devDeps: `typescript tsx vitest
  @types/node`; `.gitignore` includes `.env`, `var/`, `node_modules`, `dist`;
  `.env.example` lists `RZP_KEY_ID RZP_KEY_SECRET RZP_WEBHOOK_SECRET
  MANDATE_HMAC_KEY OPENAI_BASE_URL OPENAI_API_KEY LLM_MODEL`.
- TESTS_TO_WRITE_FIRST: `tests/smoke.test.ts` — asserts `1+1===2` and that
  `zod` imports.
- IMPLEMENTATION REQUIREMENTS: `tsconfig`: `strict:true`,
  `noUncheckedIndexedAccess:true`, `exactOptionalPropertyTypes:true`,
  `module:NodeNext`, `target:ES2022`. No eslint/prettier (PLAN §06).
- ACCEPTANCE TESTS: `npm install` exits 0; `npm test` green; `npm run
  typecheck` green; `git rev-parse --show-toplevel` = `/Users/kr/razorpay-build`.
- VERIFICATION COMMANDS: `npm install && npm run typecheck && npm test &&
  git rev-parse --show-toplevel`
- EXPECTED OBSERVABLE RESULT: "1 passed"; no TS errors; toplevel is the
  project dir, NOT `/Users/kr`.
- NEXT_TASKS_UNLOCKED: T03

## T03 — Freeze zod contracts, reason codes, interfaces

- TASK_ID: T03
- OBJECTIVE: Define every cross-module type, so all later tasks code against
  frozen contracts (this is the merge gate for parallelism).
- PRECONDITIONS: T02 green.
- FILES_ALLOWED_TO_CHANGE: `src/contracts/{schemas.ts,reason-codes.ts,
  interfaces.ts,fixtures.ts}`, `tests/contracts/**`
- FILES_FORBIDDEN_TO_CHANGE: everything outside the above; after this task
  merges, `src/contracts/**` becomes read-only for ALL subsequent tasks.
- INPUT CONTRACT: PLAN.md §04 (reason codes), §05 (entities), §06 (Gate /
  RazorpayGateway / IntentProvider / Ledger interfaces).
- OUTPUT CONTRACT:
  - `schemas.ts`: zod schemas CheckoutSnapshot, Mandate, ProposedAction,
    Decision, ExecutionToken, ExecutionRecord, WebhookEventRecord, LedgerEntry +
    inferred TS types. All amounts `z.number().int().positive()`; timestamps
    `z.number().int()`; hashes `z.string().regex(/^[0-9a-f]{64}$/)`.
  - `reason-codes.ts`: the 18-value enum from PLAN §04, frozen.
  - `interfaces.ts`: `Gate { decide(ctx): Decision }`,
    `RazorpayGateway { createOrder, fetchOrder, fetchAllOrders }`,
    `IntentProvider { extract(text): ConstraintsDraft | Clarification }`,
    `Ledger { append, replay, verifyChain }`.
  - `fixtures.ts`: one valid instance of each entity (deterministic values).
- TESTS_TO_WRITE_FIRST: `tests/contracts/schemas.test.ts` — round-trip every
  fixture; reject: unknown reason code, negative amount, 63-char hash, missing
  required field, extra unknown field (strict objects).
- IMPLEMENTATION REQUIREMENTS: `.strict()` on all object schemas; no behavior,
  no imports from outside `src/contracts`.
- ACCEPTANCE TESTS: contract tests green; a stub class implementing each
  interface typechecks (compile-time acceptance).
- VERIFICATION COMMANDS: `npm run typecheck && npm test tests/contracts`
- EXPECTED OBSERVABLE RESULT: contract suite passes; any later import of
  `src/contracts` compiles without touching other modules.
- NEXT_TASKS_UNLOCKED: T04, T05, T07, T09, T10, T12 (T08 also unblocked —
  needs only interfaces)

## T04 — Canonical hashing + mandate HMAC utilities

- TASK_ID: T04
- OBJECTIVE: Pure crypto primitives that hash-binding and mandate signatures
  depend on.
- PRECONDITIONS: T03 frozen.
- FILES_ALLOWED_TO_CHANGE: `src/core/crypto.ts`, `tests/core/crypto.test.ts`
- FILES_FORBIDDEN_TO_CHANGE: `src/contracts/**`, all other files
- INPUT CONTRACT: `canonicalHash(obj: unknown): string`;
  `signPayload(obj, key): string`; `verifyPayload(obj, sig, key): boolean`.
- OUTPUT CONTRACT: sha256 hex over `jcs(obj)`; signatures HMAC-SHA256 hex;
  verification via `crypto.timingSafeEqual`.
- TESTS_TO_WRITE_FIRST: (1) known-vector: `canonicalHash({b:1,a:2})` equals
  hash of `{a:2,b:1}` and of pinned expected hex literal; (2) determinism
  across 100 random key orders; (3) `verifyPayload` false on single-char
  payload mutation and on wrong-length signature (no throw); (4) unicode
  round-trip per RFC 8785 test vector.
- IMPLEMENTATION REQUIREMENTS: pure functions, no I/O, no `Date.now()`.
- ACCEPTANCE TESTS: all vectors green; function is referentially transparent
  (same input twice → identical output, asserted).
- VERIFICATION COMMANDS: `npm test tests/core/crypto && npm run typecheck`
- EXPECTED OBSERVABLE RESULT: pinned hex vectors match exactly; tamper cases
  all rejected.
- NEXT_TASKS_UNLOCKED: T06 (with T05), T07

## T05 — Hash-chained JSONL ledger with replay + tamper detection

- TASK_ID: T05
- OBJECTIVE: The single store for state and evidence: append-only,
  hash-chained, replayable.
- PRECONDITIONS: T03 frozen.
- FILES_ALLOWED_TO_CHANGE: `src/core/ledger.ts`, `tests/core/ledger.test.ts`
- FILES_FORBIDDEN_TO_CHANGE: `src/contracts/**`, all other files
- INPUT CONTRACT: implements `Ledger` interface; entries are `LedgerEntry`
  from contracts; storage path injected (e.g., `var/ledger.jsonl`).
- OUTPUT CONTRACT: `append(type, payload)` computes `prev_hash` from tail,
  `entry_hash = sha256(jcs({seq,type,payload,prev_hash,at}))`, fsync-append
  one JSON line; `replay()` returns typed state maps (mandates, decisions,
  executions, webhookEvents); `verifyChain()` boolean.
- TESTS_TO_WRITE_FIRST: (1) append 3 → replay equals in-memory expectation;
  (2) flip one byte on disk → `verifyChain()` false; (3) genesis entry has
  `prev_hash = "0".repeat(64)`; (4) reopen file → state survives (durability);
  (5) two appends same tick keep monotonic `seq`.
- IMPLEMENTATION REQUIREMENTS: single-writer; serialize appends via internal
  promise queue; `at` injected via constructor clock (default real).
- ACCEPTANCE TESTS: I11 test green; replay-after-crash test green.
- VERIFICATION COMMANDS: `npm test tests/core/ledger && npm run typecheck`
- EXPECTED OBSERVABLE RESULT: tampered ledger file is detected on load; clean
  ledger replays to identical state.
- NEXT_TASKS_UNLOCKED: T06 (with T04), T11

## T06 — Mandate service: issue, verify, consume, supersede

- TASK_ID: T06
- OBJECTIVE: Lifecycle owner of the signed authorization artifact.
- PRECONDITIONS: T04, T05 green.
- FILES_ALLOWED_TO_CHANGE: `src/core/mandate.ts`, `tests/core/mandate.test.ts`
- FILES_FORBIDDEN_TO_CHANGE: `src/contracts/**`, `src/core/crypto.ts`,
  `src/core/ledger.ts`
- INPUT CONTRACT: `issueMandate(constraints, approvedSnapshot, now): Mandate`
  (signs via crypto.ts, appends to ledger); `getMandate(id): Mandate&{status}`;
  `consume(id)`; `supersede(id, newConstraints, newSnapshot, now): Mandate`.
- OUTPUT CONTRACT: mandate fields per §05; status transitions
  `ACTIVE→CONSUMED|EXPIRED|SUPERSEDED` only; expiry derived (`now >
  expires_at`), never stored stale.
- TESTS_TO_WRITE_FIRST: (1) issue → signature verifies; (2) consume twice →
  second throws (I3 backing); (3) expired mandate reported EXPIRED at
  `now > expires_at` (I4 backing); (4) supersede closes old mandate and links
  `superseded_by`; (5) tampered stored bytes → verify false (I13 backing);
  (6) amount > max_amount_paise rejected at issuance.
- IMPLEMENTATION REQUIREMENTS: TTL from config constant `MANDATE_TTL_MS`
  (default 10 min) in this file; all state via ledger, no side maps that skip
  persistence.
- ACCEPTANCE TESTS: I3, I4, I13 unit tests green.
- VERIFICATION COMMANDS: `npm test tests/core/mandate && npm run typecheck`
- EXPECTED OBSERVABLE RESULT: 6 lifecycle tests pass; ledger contains
  `mandate.issued/consumed/superseded` entries.
- NEXT_TASKS_UNLOCKED: T13A

## T07 — Pure deterministic verifier

- TASK_ID: T07
- OBJECTIVE: The product's core: map `(mandate, action, fetchedSnapshot, now)`
  to a `Decision` with reason codes. No I/O. Fail closed.
- PRECONDITIONS: T03 frozen, T04 green.
- FILES_ALLOWED_TO_CHANGE: `src/core/verifier.ts`, `tests/core/verifier.test.ts`
- FILES_FORBIDDEN_TO_CHANGE: `src/contracts/**`, `src/core/crypto.ts`,
  `src/adapters/**` (must never import), `src/core/ledger.ts`
- INPUT CONTRACT: `decide(input: {mandate, action, fetchedSnapshot |
  SnapshotFetchError, now}): Decision` — implements `Gate` interface so
  baselines are drop-in.
- OUTPUT CONTRACT: `Decision` per §05: verdict ALLOW only when ALL checks pass
  (`OK`); every DENY carries ≥1 specific reason code from the frozen enum;
  `next_action:"REQUIRE_REAPPROVAL"` set on `CHECKOUT_CHANGED`.
- TESTS_TO_WRITE_FIRST — one per invariant: valid→ALLOW (I6 fields complete);
  amount ±1 → `AMOUNT_MISMATCH` (I2); merchant swap → `MERCHANT_MISMATCH`;
  currency → `CURRENCY_MISMATCH`; items → `ITEMS_MISMATCH`; over cap at
  snapshot-equal → `OVER_LIMIT`; fetched≠approved hash → `CHECKOUT_CHANGED`
  (I5); fetch error → `SNAPSHOT_UNAVAILABLE`; `fetched_at>now` →
  `SNAPSHOT_FROM_FUTURE`; stale beyond `SNAPSHOT_TTL_MS` → `STALE_SNAPSHOT`;
  expired → `MANDATE_EXPIRED`; consumed → `MANDATE_CONSUMED`; bad signature →
  `MANDATE_INVALID`; action-supplied URL ≠ mandate URL →
  `MERCHANT_BINDING_VIOLATION`; malformed input → `VERIFIER_ERROR` (I10).
- IMPLEMENTATION REQUIREMENTS: zero imports outside contracts+crypto; clock is
  the `now` param; `SNAPSHOT_TTL_MS` constant (default 60s); latency_ms
  measured by caller, not here.
- ACCEPTANCE TESTS: all 16 tests green; micro-bench: 10k decides, p99 <5ms
  (NFR2) printed by test.
- VERIFICATION COMMANDS: `npm test tests/core/verifier && npm run typecheck`
- EXPECTED OBSERVABLE RESULT: "16 passed"; latency line shows p99 <5 ms.
- NEXT_TASKS_UNLOCKED: T13A

## T08 — Executor with single-use token + receipt idempotency

- TASK_ID: T08
- OBJECTIVE: The only code path allowed to call Razorpay: consumes an ALLOW
  decision exactly once.
- PRECONDITIONS: T03 frozen (interfaces suffice; unit tests use a local spy,
  not T09's fake — keeps this parallel with T09).
- FILES_ALLOWED_TO_CHANGE: `src/core/executor.ts`,
  `tests/core/executor.test.ts`
- FILES_FORBIDDEN_TO_CHANGE: `src/contracts/**`, `src/adapters/**`,
  `src/core/verifier.ts`, `src/core/ledger.ts`
- INPUT CONTRACT: `execute({decision, token, gateway, ledger, now}):
  ExecutionRecord`; token must match decision, be unused, unexpired.
- OUTPUT CONTRACT: `receipt = ("rp-"+decision_id).slice(0,40)`; on gateway
  error → status `EXECUTION_FAILED`, on timeout/unknown → `EXECUTION_UNKNOWN`
  (no auto-retry); every outcome appended to ledger.
- TESTS_TO_WRITE_FIRST: ALLOW without token → throw; token for different
  decision → throw; token reuse → throw (I3); DENY decision → throw; gateway
  spy records exact `{amount,currency,receipt,notes}` mapping (F1–F3);
  gateway throw → `EXECUTION_FAILED` record, no exception escapes.
- IMPLEMENTATION REQUIREMENTS: token store via ledger events
  (`token.issued/token.used`); never calls gateway before token commit.
- ACCEPTANCE TESTS: I1 guard tests green; spy shows receipt format and exact
  paise passthrough.
- VERIFICATION COMMANDS: `npm test tests/core/executor && npm run typecheck`
- EXPECTED OBSERVABLE RESULT: 6 tests pass; spy log shows one createOrder per
  ALLOW, never two.
- NEXT_TASKS_UNLOCKED: T13A, T17

## T09 — Razorpay REST adapter (real + fake), no SDK

- TASK_ID: T09
- OBJECTIVE: Thin, typed `fetch` wrapper over F1–F4 plus an in-memory fake
  honoring receipt idempotency.
- PRECONDITIONS: T01 facts file exists; T03 frozen; `.env` has test keys
  (live test only).
- FILES_ALLOWED_TO_CHANGE: `src/adapters/razorpay.ts`,
  `src/adapters/razorpay.fake.ts`, `tests/adapters/razorpay.test.ts`,
  `tests/adapters/razorpay.live.test.ts`
- FILES_FORBIDDEN_TO_CHANGE: `src/contracts/**`, `src/core/**`
- INPUT CONTRACT: implements `RazorpayGateway` from contracts; base URL +
  credentials injected via constructor (env read ONLY at composition roots).
- OUTPUT CONTRACT: `createOrder({amount_paise,currency,receipt,notes})` →
  typed `{id,status,amount,currency,created_at}`; error taxonomy:
  `RzpAuthError | RzpDuplicateReceipt | RzpValidationError | RzpNetworkError |
  RzpUnknownError`; `FakeRazorpay` enforces unique receipts (throws
  `RzpDuplicateReceipt`) and stores orders for `fetchOrder/fetchAllOrders`.
- TESTS_TO_WRITE_FIRST: fake: create→fetch round-trip; duplicate receipt
  throws; live (gated `RZP_LIVE=1`, skipped otherwise): real create returns
  `order_` id; live duplicate rejected; auth failure maps to `RzpAuthError`
  (bad key).
- IMPLEMENTATION REQUIREMENTS: Basic auth header; 10s timeout; never logs
  secrets; fake mirrors documented status enum (F4).
- ACCEPTANCE TESTS: fake suite green always; live suite green with keys
  (labeled REAL_TEST_MODE); no network without `RZP_LIVE=1`.
- VERIFICATION COMMANDS: `npm test tests/adapters/razorpay.test` and
  `RZP_LIVE=1 npm test tests/adapters/razorpay.live`
- EXPECTED OBSERVABLE RESULT: unit run passes offline; live run prints a real
  `order_...` id; duplicate run shows mapped duplicate error.
- NEXT_TASKS_UNLOCKED: T13A, T17

## T10 — Synthetic merchant fixture service

- TASK_ID: T10
- OBJECTIVE: Controllable checkout source for the demo and harness (labeled
  SYNTHETIC), served over HTTP so the fetch path is production-shaped.
- PRECONDITIONS: T03 frozen.
- FILES_ALLOWED_TO_CHANGE: `src/merchant/{server.ts,cart.ts}`,
  `tests/merchant/merchant.test.ts`
- FILES_FORBIDDEN_TO_CHANGE: `src/contracts/**`, `src/core/**`,
  `src/adapters/**`
- INPUT CONTRACT: seed cart config; exposes `GET /merchant/cart` →
  CheckoutSnapshot-shaped JSON (sans hash), and `POST
  /merchant/__admin__/price {amount_paise}` mutating the cart.
- OUTPUT CONTRACT: cart response validates against CheckoutSnapshot schema;
  price mutation changes subsequent responses (and thus snapshot hash).
- TESTS_TO_WRITE_FIRST: GET validates against schema; admin price change
  reflected in next GET; two fetches of unchanged cart → identical canonical
  hash (uses contracts fixtures + T04 hash via import — import of crypto.ts
  allowed read-only).
- IMPLEMENTATION REQUIREMENTS: fastify instance factory `buildMerchantApp()`
  (no `listen` inside — caller binds port); every response header
  `x-rupeeproof-evidence: SYNTHETIC`.
- ACCEPTANCE TESTS: 3 route tests green via `app.inject()` (no real port).
- VERIFICATION COMMANDS: `npm test tests/merchant && npm run typecheck`
- EXPECTED OBSERVABLE RESULT: injected GET returns headphones cart ₹1,999;
  after admin POST, amount differs.
- NEXT_TASKS_UNLOCKED: T13A, T17

## T11 — Webhook endpoint: raw-body HMAC verify + event-id dedupe

- TASK_ID: T11
- OBJECTIVE: Production-shaped Razorpay webhook ingestion that fails closed
  and never double-processes (F5, F6, F7).
- PRECONDITIONS: T03 frozen, T05 green.
- FILES_ALLOWED_TO_CHANGE: `src/webhooks/endpoint.ts`,
  `tests/webhooks/endpoint.test.ts`
- FILES_FORBIDDEN_TO_CHANGE: `src/contracts/**`, `src/core/**` (read-only
  imports allowed), `src/adapters/**`
- INPUT CONTRACT: fastify route `POST /webhooks/razorpay` registered with
  raw-body access (no JSON pre-parse before HMAC); secret injected.
- OUTPUT CONTRACT: valid sig + new event-id → 200 + `PROCESSED` ledger record;
  valid sig + seen event-id → 200 + `DUPLICATE`; invalid sig → 401 +
  `REJECTED`; out-of-order event types → still recorded, never rejected for
  order (F7).
- TESTS_TO_WRITE_FIRST: craft bodies + `X-Razorpay-Signature` via
  node:crypto in test: valid→processed; tampered body→401; re-serialized
  (re-stringified) body signature mismatch case guarded (raw-body regression);
  same `x-razorpay-event-id` twice → one PROCESSED, one DUPLICATE; missing
  signature header → 401.
- IMPLEMENTATION REQUIREMENTS: `fastify.addContentTypeParser` preserving raw
  buffer, or Fastify `rawBody` route config; signature compare constant-time;
  dedupe set derived from ledger replay (no side-only memory).
- ACCEPTANCE TESTS: I7, I8 green; all 5 tests via `app.inject()`.
- VERIFICATION COMMANDS: `npm test tests/webhooks && npm run typecheck`
- EXPECTED OBSERVABLE RESULT: duplicate delivery yields exactly one PROCESSED
  and one DUPLICATE record in ledger.
- NEXT_TASKS_UNLOCKED: T13A, T17, T20

## T12 — Intent adapter: LLM extraction behind interface + deterministic stub

- TASK_ID: T12
- OBJECTIVE: The only LLM touchpoint; converts NL intent to schema-valid
  constraints or a clarification request; ships a deterministic stub so nothing
  else ever needs a live LLM.
- PRECONDITIONS: T03 frozen.
- FILES_ALLOWED_TO_CHANGE: `src/adapters/llm-client.ts`,
  `src/adapters/intent.ts`, `src/adapters/intent.stub.ts`,
  `tests/adapters/intent.test.ts`, `tests/arch/no-llm-authority.test.ts`
- FILES_FORBIDDEN_TO_CHANGE: `src/contracts/**`, `src/core/**`,
  `src/adapters/razorpay*`
- INPUT CONTRACT: implements `IntentProvider`; `llm-client.ts` =
  OpenAI-compatible chat-completions POST (`OPENAI_BASE_URL`, `OPENAI_API_KEY`,
  `LLM_MODEL` injected; response JSON-mode).
- OUTPUT CONTRACT: `extract(text)` → `ConstraintsDraft` (schema-valid) OR
  `{clarify: string}`; never throws into core; malformed LLM JSON → clarify.
- TESTS_TO_WRITE_FIRST: stub maps fixed phrases → fixed drafts deterministically;
  fake-client returning garbage → clarify result; fake-client returning valid
  JSON → draft; **arch test (I9)**: static scan asserts no import specifier in
  `src/adapters/intent*.ts`/`llm-client.ts` referencing `core/executor` or
  `adapters/razorpay`.
- IMPLEMENTATION REQUIREMENTS: extraction prompt requests strict JSON matching
  constraints schema; validate with zod before returning; temperature 0.
- ACCEPTANCE TESTS: 4 tests green incl. I9 arch test.
- VERIFICATION COMMANDS: `npm test tests/adapters/intent tests/arch &&
  npm run typecheck`
- EXPECTED OBSERVABLE RESULT: stub output byte-identical across runs; garbage
  LLM output never reaches core types.
- NEXT_TASKS_UNLOCKED: T13A (via stub), T14, T16

## T13A — Adversarial scenario suite + pipeline runner

- TASK_ID: T13A
- OBJECTIVE: Run the 12 scenario classes (PLAN §08) through the REAL wired
  pipeline (stub intent, fixture merchant, FakeRazorpay, real verifier,
  executor, webhook endpoint) and assert expected verdicts + invariants.
- PRECONDITIONS: T06, T07, T08, T09, T10, T11, T12 green (MERGE POINT 1).
- FILES_ALLOWED_TO_CHANGE: `src/harness/{scenarios.ts,runner.ts,assert.ts,
  wiring.ts,cli.ts}`, `tests/harness/suite.test.ts`
- FILES_FORBIDDEN_TO_CHANGE: everything under `src/core/**`,
  `src/adapters/**`, `src/merchant/**`, `src/webhooks/**`, `src/contracts/**`
- INPUT CONTRACT: scenario spec `{id, class, setup(state), buildAction,
  expected: {verdict, reason_codes[]}, expectZeroRazorpayCalls}`.
- OUTPUT CONTRACT: runner executes every spec end-to-end (HTTP inject for
  merchant+webhook, in-process for core), collects `HarnessResult[]`, asserts:
  verdict match, reason-code match, I1 (execution⇔allow link),
  zero-Razorpay-calls on deny, ledger chain valid.
- TESTS_TO_WRITE_FIRST: meta-tests — runner fails on purposefully wrong
  expectation (self-test); each of the 12 classes has exactly one spec with a
  declared expectation; deny scenarios carry `expectZeroRazorpayCalls:true`
  where applicable.
- IMPLEMENTATION REQUIREMENTS: wiring module `src/harness/wiring.ts` builds
  the full system with injected fakes; NO new production behavior — assembly
  only; adapter spy counts createOrder calls.
- ACCEPTANCE TESTS: all 12 classes pass against the RupeeProof gate; suite
  output lists each class with verdict evidence.
- VERIFICATION COMMANDS: `npm run harness` and `npm test tests/harness`
- EXPECTED OBSERVABLE RESULT: "12/12 scenario classes pass; 0 unexpected
  Razorpay calls; ledger chain OK".
- NEXT_TASKS_UNLOCKED: T13B, T14, T17

## T13B — Seeded adversarial trace generator (~1,000 traces)

- TASK_ID: T13B
- OBJECTIVE: Volume evidence: deterministic seeded generation of mutated
  traces across the 12 classes, executed through the same runner, producing a
  raw results artifact (generation only — reporting is T15).
- PRECONDITIONS: T13A green.
- FILES_ALLOWED_TO_CHANGE: `src/harness/generator.ts`,
  `tests/harness/generator.test.ts`, `eval/artifacts/harness-traces.jsonl`
  (generated)
- FILES_FORBIDDEN_TO_CHANGE: `src/harness/runner.ts`, `src/harness/scenarios.ts`,
  all production dirs
- INPUT CONTRACT: `generate(seed, count)` → scenario specs with parametrized
  mutations (amounts, merchants, TTLs, phrasings); same seed ⇒ byte-identical
  specs.
- OUTPUT CONTRACT: `eval/artifacts/harness-traces.jsonl` — one
  `{trace_id, seed, class, verdict, reason_codes, expected, pass}` per line;
  label `SYNTHETIC`.
- TESTS_TO_WRITE_FIRST: same seed → identical artifact hash; different seed →
  different; class distribution covers all 12 classes; every generated spec's
  expectation is self-consistent (oracle = declared, §08).
- IMPLEMENTATION REQUIREMENTS: mulberry32 or equivalent seeded PRNG (no
  `Math.random`); generator may not import LLM or network.
- ACCEPTANCE TESTS: 1,000 traces, 100% pass vs RupeeProof gate expectations;
  determinism test green.
- VERIFICATION COMMANDS: `npm run harness -- --seed=42 --count=1000
  --out=eval/artifacts/harness-traces.jsonl`
- EXPECTED OBSERVABLE RESULT: artifact exists; rerun with seed 42 → identical
  sha256.
- NEXT_TASKS_UNLOCKED: T15

## T14 — Baselines: amount-cap gate (B2) + LLM-judge gate (B1)

- TASK_ID: T14
- OBJECTIVE: Two simpler gates implementing the same `Gate` interface so the
  harness can prove RupeeProof outperforms them on identical traces.
- PRECONDITIONS: T13A green; T12 (B1 reuses llm-client).
- FILES_ALLOWED_TO_CHANGE: `src/baselines/{cap-gate.ts,llm-judge.ts}`,
  `tests/baselines/baselines.test.ts`,
  `eval/artifacts/baseline-{b1,b2}-results.jsonl` (generated)
- FILES_FORBIDDEN_TO_CHANGE: `src/harness/**` (import-only), production dirs,
  `src/contracts/**`
- INPUT CONTRACT: `Gate` interface from contracts; B2: allow iff
  `amount ≤ cap`; B1: LLM prompt(intent, action) → allow/deny, temp 0.
- OUTPUT CONTRACT: each gate runnable via `npm run harness -- --gate=b2|b1`;
  results artifacts in the T13B line format, labels `SYNTHETIC` (B2) /
  `MODELLED` (B1, model named in artifact header).
- TESTS_TO_WRITE_FIRST: B2 allows merchant-swap attack (documents its
  blindness — asserted, not hoped); B2 denies over-cap; B1 with fake client
  returns parseable verdict; B1 malformed LLM reply → counted as allow (this
  IS the unsafe-forward mechanism — asserted explicitly).
- IMPLEMENTATION REQUIREMENTS: baselines may not import verifier internals;
  B1's fail-open behavior is intentional and documented in code comment +
  report.
- ACCEPTANCE TESTS: harness runs to completion for both gates; B2 shows
  nonzero unsafe-forward on merchant/replay/checkout classes.
- VERIFICATION COMMANDS: `npm run harness -- --gate=b2
  --out=eval/artifacts/baseline-b2-results.jsonl` (and `b1`)
- EXPECTED OBSERVABLE RESULT: B2 artifact shows misses on ≥3 attack classes;
  B1 artifact records model name + fail-open count.
- NEXT_TASKS_UNLOCKED: T15

## T15 — Metrics computation + eval report + CLAIMS.md (reporting only)

- TASK_ID: T15
- OBJECTIVE: Turn artifacts into numbers with reproduction commands; single
  writer of all reported metrics (no other task publishes numbers).
- PRECONDITIONS: T13B, T14 green; T16 optional (tolerate missing intent
  artifact — cut-order §13).
- FILES_ALLOWED_TO_CHANGE: `src/metrics/{compute.ts,report.ts}`,
  `tests/metrics/compute.test.ts`, `eval/report.md`, `CLAIMS.md`
- FILES_FORBIDDEN_TO_CHANGE: `src/harness/**`, `src/baselines/**`,
  `eval/artifacts/**` (read-only), all production dirs
- INPUT CONTRACT: reads `eval/artifacts/*.jsonl` (+ optional
  `intent-results.json`); metric definitions from PLAN §08.
- OUTPUT CONTRACT: `eval/report.md` = metrics tables (unsafe-forward,
  valid-pass, false-denial, per-class detection, dedupe correctness, evidence
  completeness, latency p50/p99; intent accuracy if artifact present);
  `CLAIMS.md` rows: `{claim, metric, value, artifact path, reproduction
  command, label}`.
- TESTS_TO_WRITE_FIRST: golden-file: fixture artifacts → expected computed
  metrics exactly; missing intent artifact → report renders without that
  section.
- IMPLEMENTATION REQUIREMENTS: pure compute functions; every CLAIMS row must
  reference an existing artifact path (test asserts files exist).
- ACCEPTANCE TESTS: golden metrics green; CLAIMS.md contains ≥5 rows each
  with command + label.
- VERIFICATION COMMANDS: `npm run eval && npm test tests/metrics`
- EXPECTED OBSERVABLE RESULT: `eval/report.md` shows RupeeProof unsafe-forward
  0 vs B2 >0 on identical traces; CLAIMS.md rows resolve to real files.
- NEXT_TASKS_UNLOCKED: T18

## T16 — Intent corpus + extraction runner (generation only)

- TASK_ID: T16
- OBJECTIVE: Build ≥40 labeled NL intents and produce raw extraction results;
  reporting belongs to T15.
- PRECONDITIONS: T12 green.
- FILES_ALLOWED_TO_CHANGE: `eval/corpus/*.yaml`, `src/adapters/intent.eval.ts`,
  `tests/adapters/intent.eval.test.ts`, `eval/artifacts/intent-results.json`
  (generated)
- FILES_FORBIDDEN_TO_CHANGE: `src/adapters/intent.ts` (import-only),
  `src/metrics/**`, `eval/report.md`, `CLAIMS.md`
- INPUT CONTRACT: corpus entry `{id, utterance, gold_constraints, ambiguity:
  clear|ambiguous}`; runner executes provider (stub default; live LLM via
  `LLM_LIVE=1`).
- OUTPUT CONTRACT: `eval/artifacts/intent-results.json` =
  `{label:"SYNTHETIC", model, cases:[{id, predicted, gold, exact_match,
  unsafe_under_constraint}]}`.
- TESTS_TO_WRITE_FIRST: every corpus entry schema-valid (gold parses);
  corpus has ≥40 entries, ≥8 ambiguous; runner on stub is deterministic.
- IMPLEMENTATION REQUIREMENTS: unsafe-under-constraint = predicted constraints
  strictly looser than gold (defined comparator, unit-tested); no report
  prose here.
- ACCEPTANCE TESTS: corpus validation + determinism green; artifact written.
- VERIFICATION COMMANDS: `npm run eval:intent`
- EXPECTED OBSERVABLE RESULT: artifact with ≥40 scored cases; stub accuracy
  100% (self-consistency), live run labeled with model name.
- NEXT_TASKS_UNLOCKED: T15 (optional input)

## T17 — Hero demo CLI (DM1–DM6)

- TASK_ID: T17
- OBJECTIVE: One command demonstrating all six beats against REAL Razorpay
  Test Mode with printed evidence chain; the video runs this.
- PRECONDITIONS: T13A (wiring), T08, T09, T10, T11 green; `.env` populated.
- FILES_ALLOWED_TO_CHANGE: `src/demo/{cli.ts,scenario.ts,format.ts}`,
  `tests/demo/demo.test.ts`
- FILES_FORBIDDEN_TO_CHANGE: all production dirs (assembly only),
  `eval/**`
- INPUT CONTRACT: env keys; boots merchant+webhook app on an ephemeral port
  in-process; real Razorpay adapter for valid executions; replayed webhook
  payloads labeled REPLAYED.
- OUTPUT CONTRACT: `npm run demo` prints per beat: inputs, verdict, reason
  codes, evidence hashes, order id (DM1); exit 0 iff all six beats match
  expectations; DM5 shows deny→re-approval→new mandate→ALLOW→order.
- TESTS_TO_WRITE_FIRST: `--dry-run` mode (FakeRazorpay) executes all six beats
  in CI with same assertions; evidence printer formats a decision chain
  (golden output test).
- IMPLEMENTATION REQUIREMENTS: ≤5 min runtime; human-readable alignment of
  hash prefixes (first 12 chars) for video legibility; labels printed per beat.
- ACCEPTANCE TESTS: dry-run green in tests; live run: DM1 creates real order;
  DM2–DM5 show denies with correct codes; DM6 shows one PROCESSED + one
  DUPLICATE.
- VERIFICATION COMMANDS: `npm run demo` (live) and `npm test tests/demo`
- EXPECTED OBSERVABLE RESULT: terminal shows 6/6 beats ✓, one real
  `order_...` id, zero Razorpay calls on denied beats (spy count printed).
- NEXT_TASKS_UNLOCKED: T18, T19

## T18 — README + architecture writeup verified against reality

- TASK_ID: T18
- OBJECTIVE: Public-facing docs whose every claim traces to CLAIMS.md and
  whose quickstart actually works.
- PRECONDITIONS: T15, T17 green.
- FILES_ALLOWED_TO_CHANGE: `README.md`, `docs/architecture.md`
- FILES_FORBIDDEN_TO_CHANGE: `src/**`, `eval/**`, `CLAIMS.md` (reference-only)
- INPUT CONTRACT: PLAN.md §06 (diagram), CLAIMS.md, working commands.
- OUTPUT CONTRACT: README = problem, 30-second demo description, mermaid
  architecture, trust model summary, quickstart, evidence-label legend,
  metrics table copied from eval/report.md, limitations (from §08), AP2
  wording = "AP2-inspired" (§13).
- TESTS_TO_WRITE_FIRST: claim-consistency check (script or manual checklist
  executed in verification): every number in README appears in CLAIMS.md;
  quickstart commands run on a clean checkout.
- IMPLEMENTATION REQUIREMENTS: no unlabeled metrics (§7); no "fraud
  prevented" phrasing.
- ACCEPTANCE TESTS: fresh `npm install && npm test && npm run demo --dry-run`
  from clean clone succeeds; claim cross-check passes.
- VERIFICATION COMMANDS: clean-copy run of the three commands + manual
  cross-check of README numbers vs CLAIMS.md
- EXPECTED OBSERVABLE RESULT: a judge can clone, run, and see the six beats
  without touching keys (dry-run) — and with keys (live).
- NEXT_TASKS_UNLOCKED: T19

## T19 — Submission pack: video, form answers, secrets scan, public repo

- TASK_ID: T19
- OBJECTIVE: Make the submission submittable.
- PRECONDITIONS: T17, T18 green.
- FILES_ALLOWED_TO_CHANGE: `docs/submission.md`, repo settings (user executes)
- FILES_FORBIDDEN_TO_CHANGE: `src/**`, `eval/**`
- INPUT CONTRACT: research §02 (form fields), demo run, README.
- OUTPUT CONTRACT: `docs/submission.md` = 5-min video script (timestamps per
  beat), form answers (track, problem, repo URL, video URL, "what broke"),
  secrets-scan log, public-repo checklist.
- TESTS_TO_WRITE_FIRST: n/a (manual gate) — but scan commands are fixed below
  and must print clean BEFORE repo goes public.
- IMPLEMENTATION REQUIREMENTS: scan = `git grep -n -i -E "rzp_(test|live)|
  BEGIN|PRIVATE KEY|apiKey|secret" -- . ':(exclude)docs/*'` reviewed line by
  line; `.env` confirmed untracked; video = single take of `npm run demo`
  (cut order §13 permits no polish).
- ACCEPTANCE TESTS: scan output contains zero real secrets; repo public;
  video ≤5:30; form fields all filled.
- VERIFICATION COMMANDS: the grep above + `git ls-files | grep -c "^\.env$"`
  (must print 0)
- EXPECTED OBSERVABLE RESULT: public repo URL + video URL recorded in
  `docs/submission.md`; form submittable before 5 Sep.
- NEXT_TASKS_UNLOCKED: submission (terminal); T20 only if slack remains

## T20 — (STRETCH, first to cut) Live webhook via zrok + MCP recon note

- TASK_ID: T20
- OBJECTIVE: Upgrade one webhook evidence item from REPLAYED to
  REAL_TEST_MODE delivery; write a half-page MCP integration recon for the
  writeup's future-work section.
- PRECONDITIONS: T11 green; T19 done (only if slack remains).
- FILES_ALLOWED_TO_CHANGE: `docs/live-webhook.md`, `eval/artifacts/
  live-webhook.json` (generated)
- FILES_FORBIDDEN_TO_CHANGE: `src/**`, `README.md` numbers (any claim still
  via T15 process)
- INPUT CONTRACT: zrok tunnel → localhost webhook endpoint; test-mode webhook
  configured on dashboard (OTP 754081, F9).
- OUTPUT CONTRACT: artifact = one real delivered event (signature-valid,
  event-id recorded), labeled REAL_TEST_MODE; recon note lists MCP surface
  questions only (no invented tools, §3).
- TESTS_TO_WRITE_FIRST: n/a.
- IMPLEMENTATION REQUIREMENTS: if tunnel fails ≥2 attempts, abandon and keep
  REPLAYED evidence (no schedule cost).
- ACCEPTANCE TESTS: artifact present + label correct, OR task formally cut.
- VERIFICATION COMMANDS: manual (dashboard event list vs ledger record)
- EXPECTED OBSERVABLE RESULT: one REAL_TEST_MODE webhook artifact or a cut
  note; zero schedule slip.
- NEXT_TASKS_UNLOCKED: none

---

## CRITICAL_PATH

T02 → T03 → T05 → {T06 ∥-tie T11} → T13A → T14 → T15 → T18 → T19
(≈10.5 focused agent-hours). T01 runs in parallel at start (30 min, derisks
the only external dependency). T13B and T17 branch off T13A with slack and
rejoin before T18.

## PARALLEL_BRANCHES

- **Pre-freeze**: T01 ∥ T02.
- **Post-T03 (width 6)**: A: T04→T05→T06 (core state) · B: T07 (verifier) ·
  C: T09 (razorpay) · D: T10 (merchant) · E: T08 (executor, interface-only
  dep) · F: T12 (intent). T11 starts when T05 lands (branch A mid-point).
  All npm scripts are pre-declared in T02 and branch file ownership is
  disjoint by directory, so parallel branches have zero shared files.
- **Post-T13A (width 4)**: T13B ∥ T14 ∥ T16 ∥ T17.
- **Post-T15**: T18 alone; T19 after T17+T18; T20 floats after T11, executed
  only in slack.
- Realistic concurrency: 2 agents + user-as-reviewer; assign whole branches
  by directory ownership to avoid merge collisions.

## MERGE_POINTS

1. **T03 freeze gate** — all parallel branches start here; contracts become
   read-only.
2. **T13A integration join** — first task wiring all branches together; any
   interface misunderstanding surfaces here (budgeted 90 min for this reason).
3. **T15 evaluation join** — all artifacts (harness, baselines, intent)
   converge into one report.
4. **T17/T18 demo+docs join** — claims, demo, and docs reconciled before
   anything goes public.

## FINAL_INTEGRATION_SEQUENCE

1. `npm run typecheck` — whole repo green.
2. `npm test` — full suite green, zero network.
3. `npm run harness` (+ `--gate=b2 --gate=b1`) — all gates, artifacts fresh.
4. `RZP_LIVE=1 npm test tests/adapters/razorpay.live` — real path green.
5. `npm run harness -- --seed=42 --count=1000` — regenerates volume artifact.
6. `npm run eval[:intent]` — report + CLAIMS regenerated and consistent.
7. `npm run demo` — live six beats pass; screen-record for T19 video.
8. README quickstart executed from a clean copy.
9. T19 secrets scan clean → make repo public → fill form → submit (target:
   4 Sep EOD, leaving 5 Sep as buffer).
