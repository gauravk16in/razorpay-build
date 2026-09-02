# RupeeProof — CLAIMS

Every externally-facing claim, mapped to its reproducible evidence (Constitution §7).
Labels per Constitution §8: REAL_TEST_MODE | REPLAYED | SYNTHETIC | MODELLED.

| # | Claim | Metric | Value | Label | Evidence artifacts | Reproduce |
|---|-------|--------|-------|-------|--------------------|-----------|
| 1 | RupeeProof forwarded 0 of 916 seeded adversarial attack traces to Razorpay (unsafe-forward rate 0.0%) | unsafe-forward rate | 0.0% | SYNTHETIC | `eval/artifacts/harness-traces.jsonl` | `npm run harness -- --seed=42 --count=1000 --out=eval/artifacts/harness-traces.jsonl` |
| 2 | RupeeProof passed all 84 valid purchase actions (valid-action pass rate 100.0%, false-denial rate 0.0%) | valid-action pass rate | 100.0% | SYNTHETIC | `eval/artifacts/harness-traces.jsonl` | `npm run harness -- --seed=42 --count=1000 --out=eval/artifacts/harness-traces.jsonl` |
| 3 | An amount-cap-only baseline (B2) unsafely forwarded 81.9% of the IDENTICAL attack traces that RupeeProof fully denied | baseline unsafe-forward rate | 81.9% | SYNTHETIC | `eval/artifacts/baseline-b2-results.jsonl`<br>`eval/artifacts/harness-traces.jsonl` | `npm run harness -- --seed=42 --count=1000 --gate=b2 --out=eval/artifacts/baseline-b2-results.jsonl` |
| 4 | Adversarial scenario suite: 14/14 classes pass end-to-end with zero Razorpay calls on any denial (asserted via gateway spy) | scenario suite pass | 14/14 | SYNTHETIC | `eval/artifacts/suite-rupeeproof.jsonl` | `npm run harness -- --out=eval/artifacts/suite-rupeeproof.jsonl` |
| 5 | Duplicate webhook delivery is processed exactly once (dedupe via x-razorpay-event-id); invalid signatures are rejected with no state change | webhook dedupe correctness | 1.0 | SYNTHETIC | `eval/artifacts/suite-rupeeproof.jsonl` | `npm run harness -- --out=eval/artifacts/suite-rupeeproof.jsonl` |
| 6 | Verifier decision latency p99 < 5 ms over 10,000 decisions (pure, in-process) | verify latency p99 | p99 < 5 ms | SYNTHETIC | `tests/core/verifier.test.ts` | `npm test tests/core/verifier` |
| 7 | Intent extraction accuracy 16.7% over 42 labeled utterances (model: stub-deterministic); unsafe-under-constraint rate 0.0% | intent extraction accuracy | 16.7% | SYNTHETIC | `eval/artifacts/intent-results.json` | `npm run eval:intent` |
