# RupeeProof — Submission Pack (Razorpay AI Buildathon 2026)

Deadline: 5 Sep 2026. Deliverables: public repo, working product, 5-min pitch
video, architecture writeup (README.md + docs/architecture.md).

## Secrets scan (required before public)

Executed 2 Sep 2026 on commit `157bfa4`:

```
git grep -n -i -E "rzp_(test|live)_[A-Za-z0-9]{8,}|BEGIN [A-Z ]*PRIVATE KEY|apiKey.*['\"][A-Za-z0-9_-]{20,}|secret.*['\"][A-Za-z0-9_-]{20,}" -- .
git ls-files | grep -c "^\.env$"   →  0
```

Result: **clean** — no keys, no secrets in tracked files; `.env` never
committed (gitignored since scaffold). Re-run both commands after any live-mode
run before flipping the repo public.

## Public-repo checklist

- [ ] All tasks committed and pushed (check `git status` clean)
- [ ] Secrets scan re-run clean (above)
- [ ] README quickstart verified from a fresh clone
- [ ] GitHub repo flipped to **public**
- [ ] Video URL added below + to submission form

## Video script (5 min, single take of `npm run demo` + slides optional)

- **0:00–0:25 — Hook.** "An AI agent can call Razorpay perfectly — and still
  spend the wrong money. A valid API call is not an authorized transaction.
  RupeeProof proves an AI paid exactly what the user authorized."
- **0:25–0:50 — Problem.** Show the gap: intent → execution. Attacks: amount
  mutation, merchant substitution, replay, post-approval price change,
  duplicate webhooks.
- **0:50–1:20 — Demo DM1.** Valid purchase → ALLOW → real Razorpay Test Mode
  order id on screen (live mode) — point at decision record + hashes.
- **1:20–2:40 — Attacks DM2–DM4.** Amount mutation → `AMOUNT_MISMATCH`.
  Merchant swap → `MERCHANT_MISMATCH`. Replay → `MANDATE_CONSUMED`. Emphasize:
  **zero Razorpay calls on any denial** (spy count printed).
- **2:40–3:25 — DM5.** Price change after approval → `CHECKOUT_CHANGED` →
  re-approval → new mandate → ALLOW. "Authorization binds to exact checkout
  state, not to vibes."
- **3:25–3:45 — DM6.** Duplicate webhook → one PROCESSED, one DUPLICATE.
- **3:45–4:20 — Numbers.** `CLAIMS.md` + `eval/report.md`: 1000/1000 seeded
  traces, 0.0% unsafe-forward vs 81.9% for an amount-cap baseline on identical
  traces; 14/14 scenario classes; verifier p99 < 5 ms. All reproducible:
  `npm run eval`.
- **4:20–4:50 — Architecture.** README mermaid: LLM interprets, deterministic
  core authorizes; adapters for all I/O; hash-chained evidence ledger.
  "AP2-inspired" — say it exactly that way.
- **4:50–5:10 — Honesty + close.** Labels: REAL_TEST_MODE vs REPLAYED vs
  SYNTHETIC. Test Mode only. Limitations: fixture merchant, order-creation
  boundary. "The AI proposes. RupeeProof disposes."

Recording: `npm run demo` (live keys) or `npm run demo --dry` (fallback,
labeled SYNTHETIC on screen). Terminal font ≥16pt, `clear` before start.

## Form answers

- **Track**: AI Growth & Agentic Commerce
- **Project name**: RupeeProof
- **Problem**: AI agents can initiate payments, but a valid Razorpay API call
  is not necessarily an authorized transaction. Between intent and execution,
  amounts, merchants, carts, and replay state can mutate. RupeeProof is a
  verification layer that binds a signed user authorization to the exact
  checkout state and deterministically allows/denies every AI-proposed payment
  action before it reaches Razorpay — with hash-chained evidence for every
  decision.
- **Public GitHub URL**: https://github.com/gauravk16in/razorpay-build
- **Video URL**: _TBD after recording_
- **What broke / how we got out** (pick 2–3 when filling the form):
  1. Webhook signature verification failed silently until we hashed the **raw
     body** — re-serialized JSON has different bytes. Regression test now
     proves raw-body hashing (Razorpay docs require it).
  2. Replay detection initially had no state: the executor burned its token
     but nothing consumed the mandate. The adversarial harness caught a second
     execution going through; the pipeline now consumes the mandate on
     CREATED (idempotently, so baseline gates don't crash the measurement).
  3. Baseline comparison exposed that "deny" is not enough — the amount-cap
     gate denies over-limit but forwards 81.9% of attacks. That became the
     core quantitative argument of the submission.

## Remaining live-mode steps (when keys arrive in `.env`)

1. `T01` smoke: create one real order via curl (`rp-t01-smoke` receipt),
   write `docs/razorpay-facts.md`.
2. `RZP_LIVE=1 npm test tests/adapters/razorpay.live` — adapter vs real API.
3. `npm run demo` (live) — DM1/DM4/DM5 produce real `order_` ids → video take.
4. Optional: `npm run harness -- --gate=b1 --seed=42 --count=1000
   --out=eval/artifacts/baseline-b1-results.jsonl` (needs OPENAI_* envs),
   then `npm run eval` to fold B1 into CLAIMS.md.
5. Re-run secrets scan → flip repo public → submit form.

## Cut status

- **T20 (zrok live webhook + MCP recon): CUT** per cut-order #1. Webhook
  evidence stays REPLAYED/SYNTHETIC and is labeled as such everywhere.
