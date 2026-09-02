# AGENTS.md — RupeeProof (Razorpay AI Buildathon 2026)

## Repo state

- Planning complete, implementation in progress against `PLAN.md` /
  `TASKS.md` (do not redesign silently — Constitution §9).
- Done: T02–T19 except live-mode steps (scaffold → contracts → core → adapters
  → harness → baselines → metrics/CLAIMS → corpus → demo → README/submission).
  **`src/contracts/**` is frozen — do not edit.** T20 cut per cut-order.
- Remaining: user drops Test Mode keys in `.env` → T01 smoke, live demo,
  optional live B1 → secrets scan → repo public → form (docs/submission.md).
- Commands: `npm test` (vitest, offline default; live Razorpay tests gated by
  `RZP_LIVE=1`) · `npm run typecheck` · `npm run harness` (add `--seed=42
  --count=1000 --out=<f> [--gate=b2|b1]` for traces) · `npm run eval` ·
  `npm run demo [--dry]` · gate order typecheck → test → harness.
- Dedicated git repo lives here (toplevel = this dir), remote `origin` →
  github.com/gauravk16in/razorpay-build. Ask the user before any git mutation.

## Git — read before ANY git command

- This project has its **own dedicated repo** (initialized 2 Sep 2026);
  `git rev-parse --show-toplevel` from here returns `/Users/kr/razorpay-build`.
- **However**: a separate git repo still exists at `/Users/kr` (the whole home
  directory, zero commits). Running git commands from anywhere OUTSIDE this
  project dir operates on the home-wide repo — staging there would sweep up
  `~/.ssh`, `~/.aws`, API keys. Only run git from within this project.
- Ask the user before every git mutation (commit, push, etc.), even if
  earlier sessions committed.
- Submission requires a **public** GitHub repo. Secrets must never enter it:
  `.env` is gitignored; scan before making the repo public (TASKS.md T19).

## Governing documents (read in this order)

1. `PROJECT_BRIEF.md` — product thesis, hero demo, P0 scope, evaluation plan.
2. `CONSTITUTION.md` — 14 binding engineering rules. Hard constraints, not style
   advice.
3. `PLAN.md` — frozen architecture, decision register, task graph T01–T20.
   External-API facts there were verified against official Razorpay docs on
   2 Sep 2026 (see its Fact Register).
4. `TASKS.md` — executable task cards compiled from `PLAN.md` §11 (T01–T20,
   with T13 split into T13A/T13B). Coding agents execute these exactly: file
   ownership, contracts, tests-first, verification commands.
4. `razorpay-buildathon-research.html` — competitive research + verified
   Buildathon rules. Dense raw HTML; strip tags or open in a browser. Note: it
   uses the old name **"RupeeFence"** — same project, renamed to **RupeeProof**.
5. `Razorpay Hackathon Strategy.pdf` — strategy deck (no PDF text extractor is
   installed locally).

## Constitution rules that most change agent behavior

Full text is binding; these are the ones easiest to violate by default:

- **No invented APIs** (§3): never guess Razorpay endpoints, webhook semantics,
  MCP tools, or AP2 schemas. Verify against official docs before writing code.
- **LLM never authorizes** (§1): the model interprets intent; deterministic code
  authorizes payments. Keep Razorpay/network behind adapters so the verification
  core is testable offline (§5).
- **Fail closed** (§2): unverifiable authorization evidence = deny, never
  silently proceed.
- **Test Mode only** (§4): Razorpay Test Mode for all dev/demo; never commit
  secrets, payment credentials, or customer data.
- **Label all evidence** (§8): every result is tagged `REAL_TEST_MODE`,
  `REPLAYED`, `SYNTHETIC`, or `MODELLED`.
- **Evidence before claims** (§7): no metric in README/demo/pitch without a
  reproducible artifact, tracked in `CLAIMS.md` (does not exist yet — create it
  with the first claim).
- **AP2 wording** (§13): say "AP2-inspired" unless the implementation genuinely
  follows AP2 schemas/signatures/verification semantics.
- **No silent redesign** (§9): if a task conflicts with an invariant or frozen
  architecture — STOP, document the conflict, escalate to the user.
- **Verification before completion** (§11): "should work" is not done; require
  passing tests, typecheck, a real API response, or a reproducible artifact.

## Scope, demo, deadline

- **Deadline: 5 Sep 2026** (applications close; no official cutoff time
  published). Deliverables: public repo, working product, 5-min pitch video,
  architecture writeup. Today is 2 Sep — plan for failure buffer.
- P0 = one real Razorpay Test Mode path with strong invariants + deterministic
  adversarial/failure harness + quantitative evaluation vs simpler baselines.
  Explicitly cut (unless planning says otherwise): voice, multi-agent
  orchestration, marketplace, full AP2, broad Razorpay MCP coverage, dashboards —
  full list in `PROJECT_BRIEF.md` → "Likely Cuts".
- Hero demo must show: valid action accepted; amount mutation, merchant
  substitution, and replay each rejected; checkout/price change → re-approval or
  denial; duplicate webhook deduplicated.
