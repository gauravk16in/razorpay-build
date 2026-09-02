# RupeeProof — Evaluation Report

Regenerate with `npm run eval`. Every number below is computed from committed
artifacts in `eval/artifacts/` by `src/metrics/compute.ts` (single writer).

## Headline: transaction integrity vs baselines

| Gate | Traces | Oracle match | Unsafe-forward | Valid pass | False deny | Evidence completeness |
|------|--------|--------------|----------------|------------|------------|-----------------------|
| rupeeproof | 1000 | 100.0% | 0.0% | 100.0% | 0.0% | 100.0% |
| b2-cap-gate | 1000 | 8.4% | 81.9% | 100.0% | 0.0% | 100.0% |

## Per-class detection rate (attack classes, deny = detected)

| Class | rupeeproof | b2-cap-gate |
|-------|------|------|
| amount-mutation | 100.0% | 0.0% |
| checkout-change | 100.0% | 0.0% |
| currency-swap | 100.0% | 0.0% |
| expired-mandate | 100.0% | 0.0% |
| items-mutation | 100.0% | 0.0% |
| merchant-substitution | 100.0% | 0.0% |
| over-limit | 100.0% | 100.0% |
| over-limit-exact | 100.0% | 100.0% |
| replay | 100.0% | 0.0% |
| stale-snapshot | 100.0% | 0.0% |
| tampered-mandate | 100.0% | 0.0% |

## Adversarial scenario suite (end-to-end pipeline)

| Gate | Classes passed | Zero Razorpay calls on deny | Webhook dedupe |
|------|----------------|-----------------------------|----------------|
| rupeeproof | 14/14 | NO | correct |
| b2-cap-gate | 5/14 | yes | correct |

## Latency

Verifier p99 < 5 ms over 10,000 pure in-process decisions (bench-asserted).
Reproduce: `npm test tests/core/verifier` (prints p50/p99).

## Intent extraction

Model: stub-deterministic — accuracy 16.7% over 42 labeled
utterances; unsafe-under-constraint rate 0.0%.
Corpus is small and English-only (SYNTHETIC).

## Labels & limitations

- All trace/suite numbers are **SYNTHETIC**: seeded generator, fixture merchant, in-memory gateway.
- REAL_TEST_MODE rows appear in CLAIMS.md only when backed by a live Razorpay Test Mode artifact.
- The merchant is a fixture; payment completion is out of scope (execution boundary = order creation).
- B1 (LLM-as-judge) numbers are added when LLM credentials are available (gate=b1).
