# RupeeProof — Project Brief

## Hackathon

Razorpay AI Buildathon 2026

Track:
AI Growth & Agentic Commerce

Official page:
https://razorpay.com/buildathon/

Internal target:
Submit before the official deadline with enough buffer for failure,
video recording, repository cleanup, and form submission.

---

# Current Project Direction

Name:
RupeeProof

Working category:
Verifiable execution for AI-initiated Razorpay payments.

One-line product thesis:

> RupeeProof proves that an AI paid exactly what the user authorized.

More precise technical description:

> RupeeProof is a Razorpay-native transaction verification and
> execution-evidence layer for agentic commerce.

This definition is not sacred.

The architecture/planning agent may refine it if the attached research
reveals a stronger formulation, but it must not casually switch to an
unrelated project or hackathon track.

---

# Problem

AI agents are increasingly capable of initiating commerce and financial
operations.

A valid API call is not necessarily an authorized transaction.

Between:

USER INTENT
and
PAYMENT EXECUTION

we need evidence that the proposed action still matches what the user
actually authorized.

Important transaction properties may include:

- merchant
- amount
- currency
- cart/items
- checkout state
- expiration
- action type
- approval
- replay/idempotency state

The exact architecture for enforcing these must be derived during planning.

---

# Core Architectural Principle

> The model interprets intent. It never grants authority.

Probabilistic AI may be appropriate for:

- natural-language understanding
- ambiguity detection
- clarification
- explanation

Consequential payment authorization must not depend solely on an LLM.

---

# Desired Demonstrable Capability

The smallest successful end-to-end system should be able to demonstrate:

1. A user expresses purchase intent in natural language.
2. The system converts the intent into structured constraints.
3. An authorization representation is established.
4. A merchant checkout/cart is represented.
5. The proposed financial action is independently verified.
6. A valid action can create a real Razorpay Test Mode operation.
7. Invalid or stale actions are rejected before execution.
8. Razorpay events are associated with the execution.
9. The system produces evidence showing:
   - what was authorized
   - what was proposed
   - what was executed
   - why it was allowed or denied

The planning agent may refine this flow.

---

# Hero Demonstration Concept

Example intent:

"Buy these headphones from SonicStore for no more than ₹2,000."

Expected demonstration families:

VALID ACTION
→ accepted
→ Razorpay Test Mode action created

AMOUNT MUTATION
→ rejected

MERCHANT SUBSTITUTION
→ rejected

REPLAY
→ rejected

CHECKOUT / PRICE / SHIPPING CHANGE
→ re-approval or rejection

DUPLICATE WEBHOOK
→ deduplicated

These are demonstration requirements, not predetermined implementation
details.

---

# Evaluation Requirement

The project must be quantitatively evaluated.

At least two dimensions should be considered:

## Intent understanding

Potential measures:

- constraint extraction accuracy
- ambiguity detection
- unsafe under-constraint rate

## Transaction integrity

Compare the final system against simpler baselines.

Potential measures:

- unsafe-forward rate
- valid-action pass rate
- false-denial rate
- violation detection by class
- evidence completeness
- latency

Exact benchmark methodology must be designed during planning.

---

# AP2 Position

Google AP2 is relevant prior art and a reference model for agent-payment
authorization.

Do NOT assume that RupeeProof invented:

- payment mandates
- signed authorization
- checkout binding
- transaction evidence

Do NOT claim AP2 compatibility unless the implementation genuinely follows
the relevant official schemas, credentials, signatures, and verification
semantics.

Safe initial positioning:

"AP2-inspired authorization semantics"

A genuine AP2 subset may be considered only after the core P0 system works.

---

# Differentiation Requirement

A generic architecture such as:

LLM
→ policy gate
→ Razorpay

is NOT sufficiently differentiated.

Public projects already exist around:

- agent payment policy gates
- MCP security boundaries
- spending limits
- approval flows
- merchant rules
- Razorpay execution

The architecture must identify and preserve a more defensible contribution,
currently believed to center around exact transaction-state binding and
execution evidence.

This hypothesis must be challenged during planning.

---

# P0 Philosophy

Build the smallest system that proves the core capability deeply.

Prefer:

- one real Razorpay Test Mode path
- narrow scope
- strong invariants
- reproducible evaluation
- explicit failure handling
- excellent evidence
- clear documentation

over broad feature coverage.

---

# Likely Cuts

Unless research or dependency analysis strongly changes the conclusion,
these are NOT P0:

- voice
- multi-agent orchestration
- marketplace
- general product discovery
- recommendation engine
- custom foundation model
- production money movement
- huge analytics dashboard
- complete AP2 implementation
- broad Razorpay MCP tool coverage

---

# Required Honesty

Always distinguish:

REAL TEST MODE
REPLAYED
SYNTHETIC
MODELLED

Never claim:

- real fraud prevented
- real GMV increased
- real financial loss prevented

unless such claims are actually supported by evidence.

The objective is to build and prove a defensible engineering capability,
not manufacture impressive metrics.