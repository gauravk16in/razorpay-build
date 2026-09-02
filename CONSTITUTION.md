# RupeeProof Engineering Constitution

These rules apply to architecture, implementation, evaluation, and
documentation unless explicitly revised through a documented design decision.

## 1. Financial Authority

An LLM must never be the sole authority for a consequential financial action.

AI may interpret.

Deterministic systems authorize.

---

## 2. Fail Closed

When required authorization evidence cannot be verified, execution must not
silently continue.

Unknown is not equivalent to allowed.

---

## 3. No Invented APIs

Never invent:

- Razorpay endpoints
- webhook semantics
- MCP tools
- AP2 schemas
- protocol requirements

Verify uncertain external behavior using official documentation.

---

## 4. Test Mode Only

Development and demonstrations must use Razorpay Test Mode.

Never commit:

- API secrets
- payment credentials
- personal financial data
- sensitive customer data

---

## 5. External Systems Behind Adapters

Domain logic must not depend directly on network APIs.

The transaction verification core should be independently testable.

---

## 6. Explicit Contracts

Prefer typed schemas and machine-readable states over implicit assumptions.

Important decisions must have machine-readable reason codes.

---

## 7. Evidence Before Claims

No metric may appear in README, demo, or pitch unless a reproducible artifact
supports it.

Every significant claim should eventually appear in CLAIMS.md.

---

## 8. Real vs Synthetic

Every result must clearly indicate whether it is:

REAL_TEST_MODE
REPLAYED
SYNTHETIC
MODELLED

---

## 9. No Silent Architectural Changes

Implementation agents must not silently redesign frozen architecture.

If a task conflicts with an invariant or architecture decision:

STOP
→ document conflict
→ escalate to planning/review

---

## 10. Scope Discipline

A feature must strengthen at least one of:

- hero demo
- core correctness
- measurable evaluation
- Razorpay integration
- failure handling
- judge understanding

Otherwise it is probably not P0.

---

## 11. Verification Before Completion

"Should work" is not completion.

Completion requires observable evidence such as:

- passing tests
- successful typecheck
- actual API response
- reproducible benchmark
- verified artifact

---

## 12. Debugging

When something fails:

OBSERVE
→ REPRODUCE
→ FORM ROOT-CAUSE HYPOTHESIS
→ CREATE SMALLEST TEST
→ FIX
→ VERIFY

Do not stack random patches.

---

## 13. Protocol Claims

Use "AP2-compatible", "AP2-compliant", or similar wording only when supported
by the actual implementation.

Otherwise use narrower language such as:

"AP2-inspired"
"uses AP2 authorization concepts"
"implements subset X of AP2"

---

## 14. Simplicity

Prefer the least complex architecture that satisfies all acceptance criteria.

Complexity itself is not technical depth.

Reliability, state correctness, evaluation quality, and explicit failure
behavior are technical depth.