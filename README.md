# RupeeProof

**RupeeProof proves that an AI paid exactly what the user authorized.**

It is a Razorpay-native transaction verification and execution-evidence layer for
agentic commerce: user intent becomes a signed, checkout-bound **mandate**; a
**deterministic verifier** (never the LLM) allows or denies every proposed
payment action before execution; and every decision lands in a
**hash-chained evidence ledger**. Built for the Razorpay AI Buildathon 2026,
Track 1 (AI Growth & Agentic Commerce). Razorpay **Test Mode** only.

> The model interprets intent. It never grants authority.

## The 30-second proof

`npm run demo` runs six beats against the real pipeline (no keys needed for the
offline dry-run; add Test Mode keys for live order creation):

1. **Valid action** → allowed → Razorpay order created
2. **Amount mutation** → denied (`AMOUNT_MISMATCH`)
3. **Merchant substitution** → denied (`MERCHANT_MISMATCH`)
4. **Replay** → denied (`MANDATE_CONSUMED`)
5. **Checkout price change after approval** → denied (`CHECKOUT_CHANGED`) →
   re-approval → new mandate → accepted
6. **Duplicate webhook** → processed once (`x-razorpay-event-id` dedupe)

Every beat prints its verdict, reason codes, and evidence hashes, labeled
`REAL_TEST_MODE` / `REPLAYED` / `SYNTHETIC`.

## Numbers (all reproducible — see CLAIMS.md)

| Metric | RupeeProof | B2 amount-cap baseline |
|---|---|---|
| Seeded adversarial traces matching safety oracle | **1000/1000** | 84/1000 |
| Unsafe-forward rate (916 attack traces, identical seeds) | **0.0%** | 81.9% |
| Valid-action pass rate | **100%** | 100% |
| Attack-class detection (11 classes) | **100% all classes** | >0% only on 2 |
| Adversarial scenario suite | **14/14** | 5/14 |
| Verifier latency p99 (10k decisions) | **< 5 ms** | — |

Intent extraction (SYNTHETIC, deterministic stub fallback): 7/42 exact,
0 unsafe-under-constraint, 9/9 ambiguous → clarify. Live-model numbers are
added when LLM credentials are available.

Every number regenerates from committed artifacts: `npm run eval`.
See `CLAIMS.md` for the claim→artifact→command mapping and `eval/report.md`
for the full tables.

## Architecture

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
  WH --> LG[(Hash-chained<br/>JSONL Ledger)]
  MS --> LG
  VER --> LG
  EX --> LG
```

Trust boundaries:

- **LLM output is untrusted** — schema-gated, never authoritative. A static
  architecture test (I9) proves no import path from the LLM layer to the
  executor or Razorpay adapter.
- **The verifier is pure** — no I/O, injected clock; fail-closed on any error.
- **Snapshots are fetched only from the mandate-bound merchant URL** — never
  from action-supplied data.
- **Execution needs a single-use token** minted by an ALLOW decision; the token
  is burned *before* any network call; `receipt = rp-<decision_id>` gives
  Razorpay-side idempotency.
- **Webhooks are verified on the raw body** before parsing and deduplicated by
  `x-razorpay-event-id`; they record facts only, with zero authority.

Key invariants (full list in `PLAN.md` §04, all machine-tested): no execution
without a matching ALLOW (I1) · field/hash binding (I2) · one execution per
mandate (I3) · expiry (I4) · checkout-state binding (I5) · complete decision
evidence (I6) · webhook dedupe (I7) · signature rejection (I8) · no LLM
authority path (I9) · fail closed (I10) · tamper-evident ledger (I11) ·
merchant binding (I12) · mandate integrity (I13).

## Quickstart

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest, fully offline
npm run demo --dry  # six-beat hero demo, no keys needed (SYNTHETIC)
```

With Razorpay **Test Mode** keys in `.env` (see `.env.example`):

```bash
npm run demo        # live: DM1/DM4/DM5 create real test-mode orders
RZP_LIVE=1 npm test tests/adapters/razorpay.live   # adapter smoke vs real API
```

Evaluation:

```bash
npm run harness                                   # 14/14 adversarial classes
npm run harness -- --seed=42 --count=1000 \
  --out=eval/artifacts/harness-traces.jsonl       # 1000 seeded traces
npm run harness -- --seed=42 --count=1000 --gate=b2 \
  --out=eval/artifacts/baseline-b2-results.jsonl  # baseline on identical traces
npm run eval:intent                               # intent corpus eval
npm run eval                                      # regenerates report + CLAIMS.md
```

## Evidence labels (Constitution §8)

- **REAL_TEST_MODE** — actual Razorpay Test Mode API responses (requires keys)
- **REPLAYED** — captured/re-signed webhook deliveries
- **SYNTHETIC** — seeded generator, fixture merchant, in-memory gateway
- **MODELLED** — LLM-produced outputs (baseline B1, intent extraction)

## Limitations (by design — P0 scope)

- Merchant is a labeled fixture; no production merchant integration.
- Execution boundary = **order creation**; payment completion (checkout,
  refunds, payouts) is out of scope.
- Mandate signatures are HMAC (single issuer-verifier); no third-party
  verifiability yet.
- Webhook delivery evidence is REPLAYED (Razorpay cannot deliver to localhost;
  common tunnels are blacklisted — see `PLAN.md` F8).
- "AP2-inspired" authorization semantics — this is **not** an AP2
  implementation (Constitution §13).
- No claims about real fraud prevented or real GMV — only the reproducible
  artifacts above.

## Repository map

- `src/contracts/` — **frozen** zod schemas, 18 reason codes, interfaces
- `src/core/` — crypto, ledger, mandate, verifier, executor (pure, deterministic)
- `src/adapters/` — Razorpay REST (+fake), intent (LLM + stub), llm-client
- `src/merchant/`, `src/webhooks/` — fixture + webhook Fastify apps
- `src/harness/` — adversarial suite + seeded trace generator
- `src/baselines/` — B2 cap-gate, B1 LLM-judge
- `src/metrics/` — single writer of all reported numbers
- `src/demo/` — hero demo CLI
- `PLAN.md` · `TASKS.md` · `CLAIMS.md` · `eval/report.md` — governing docs
