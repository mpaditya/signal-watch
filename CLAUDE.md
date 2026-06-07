# Project Artha — Claude Code Context

## ⛔ TESTING RULES — NON-NEGOTIABLE (read before writing any test)
Mandatory for every build, feature, fix, or refactor. They exist because a past "one-shot"
build shipped test files that never ran and tested fake (copied) code.

1. **TEST THE REAL CODE, NEVER A COPY.** Every test MUST `import` the function/component from
   its real module. NEVER copy/paste/re-declare the code under test inside the test file —
   "inline copies", "simulate the functions", "copied for standalone testing" are FORBIDDEN.
2. **TESTS MUST ACTUALLY RUN under the runner: Vitest (`npm test`).** Use `describe/it/expect`
   from `vitest`, never a homemade console.log harness. After adding tests, run `npm test` and
   paste the output. "Tests written" ≠ "tests pass" — only runner output counts.
3. **PROVE NEW TESTS HAVE TEETH.** For any non-trivial test, briefly mutate the real code to
   confirm it FAILS, then revert. A test that can't fail is theater.
4. **INTEGRATION OVER UNIT FOR UI WIRING.** Unit tests pass while the feature is broken (button
   never renders, wrong prop/key). For component features, add a React Testing Library test that
   mounts the REAL component, clicks the REAL buttons, and asserts what the user sees.
5. **NEVER REPORT COVERAGE YOU DID NOT RUN.** Don't claim "N tests pass" unless `npm test` just
   printed it. Don't cite test counts from docs as proof they pass.

Run `npm test` before every commit touching `src/`. Green must mean green.

## What This Is
Personal AI finance co-pilot for Indian mutual fund investing. React 18 + Vite, all logic
in-browser. Two goals: (1) PRIMARY — help the builder make better investment decisions;
(2) SECONDARY — learn AI-driven development and build a production-grade app.

## Current State (Sprint 3 DONE — merged to main, Jun 2026)
Shipped: AR-1 (Supabase sync: goals+config+corpus, read-back, token refresh), AR-2 (magic-link
auth + sessionStorage), AR-3 (signal history), AR-4 (decisions log, all 6 actions), SW-14 (goal
status enum), SE-10 (prompt-injection hardening), SW-15 (dynamic add/archive funds), SW-16
(composite goals: MF+RD+FD per-instrument returns + blended return), QA-1 (real Vitest/RTL suite —
168 tests; the project previously had NO working tests). See docs/MASTER-BACKLOG.md.

Next (Sprint 4): AR-1b (multi-device cloud-sync of instruments/per-fund-rates/fund-overlay —
currently localStorage + same-browser only), then AN-1 (signal trends), AN-5 (XIRR), SE-2 (rate limiting).

## Architecture
- Frontend: React 18 + Vite + Recharts. Single-page app, inline CSS + CSS variables (no Tailwind).
- State: localStorage (keys: artha_config_v1, artha_goal_corpus, artha_goals_v4, artha_abandoned_goals,
  artha_pe_manual, artha_pe_cache, artha_lump_sum). Supabase Postgres when configured (write-through).
- NAV data: mfapi.in (free, public). Market P/E: NSE API → LLM → cache → estimated fallback.
- LLM: Gemini via `src/llm.js` (BYOK, key in localStorage). Email alerts: Python + Resend, GitHub
  Actions cron (6:30pm IST weekdays). Hosting: GitHub Pages (mpaditya.github.io/signal-watch).

## Core Design Principles (MUST follow)
1. YOU DECIDE, AI ADVISES — no agent ever executes transactions
2. GOAL-FIRST — all analysis anchored to specific goals and timelines
3. DATA MINIMISATION — never send raw rupee amounts, specific fund names, or PII to any LLM. Use
   percentages, ratios, time horizons only. Enforce via prompt templates.
4. VALIDATE LLM OUTPUTS — every actionable recommendation sanity-checked by deterministic rules
   before display: static policy checks (SIP caps, CAGR consistency, timeline/risk bounds) AND
   drift detection (LLM narration vs deterministic tool outputs). Validator is rule-based, never an LLM.
5. PLANNER-NARRATOR PATTERN — LLMs sit at the boundaries (planning + narration), never in the
   middle. Deterministic code does all math. See DEC-042.
6. USEFUL WITHOUT LLM, BETTER WITH — every feature works if all LLMs are unavailable
7. NO PAID LOCK-INS — all run-phase dependencies must have a free tier or open-source alternative
8. RESILIENT BY DESIGN — graceful degradation if any API (Gemini, NSE, mfapi, Supabase) fails
9. PROPER COMPOUNDING — SIP projections use r = (1+annual)^(1/12)-1, NOT annual/12

## Financial Rules (in goalUtils.js)
- 7 goal types: car, house, travel, education, wedding, retirement, emergency. Each has default
  CAGR, horizon range, equity cutoff period, fixed/flexible flag.
- Emergency fund: NO EQUITY EVER. Debt/liquid/arbitrage only.
- Health scoring: Green ≥90%, Amber 70–90%, Red <70% on-track.
- Off-track engine: 5 levers in goal-type-specific priority order.
- Required CAGR shown only for Amber/Red goals (reduces noise). Neutral signals still warn about
  derisking if goal is within the equity cutoff window.

## LLM Architecture (for future agent features)
- Multi-LLM cascade: primary free → secondary free → cached stale → deterministic-only.
- Provider abstraction handles all LLM calls (no direct API calls from features).
- Response validation layer between LLM output and display: static policy + drift detection (SE-5).
- Build own orchestration — no LangGraph/CrewAI/heavyweight frameworks.
- Traceability: log every LLM call (provider, model, prompt, response, tool calls, tokens). Validation
  rules grow from observed failures via traceability-log review (SE-7).

## Key Commands
- `npm run dev` — local dev server (port 5173) · `npm run build` — production build to dist/
- `npm test` — Vitest suite · `git push` — triggers GitHub Actions → GitHub Pages deploy

## Key Files
- src/App.jsx — main UI, signal logic, verdicts, fund cards
- src/goalUtils.js — ALL financial math, projection engine, off-track levers
- src/components/GoalDashboard.jsx — goal health container, v3↔v4 schema bridge
- src/components/GoalCard.jsx — individual goal health card · GoalForm.jsx — add/edit goal modal
- src/components/ChatPanel.jsx — floating AI chat (SW-4); buildContext() anonymises portfolio
- src/components/LLMSettings.jsx — Gemini API key modal
- src/components/AuthModal.jsx — AR-2 magic-link login · SignalHistory.jsx — AR-3 · DecisionLog.jsx — AR-4
- src/llm.js — LLM abstraction (AR-5): callLLM(), hasLLMKey(), setLLMKey()
- src/supabase.js — AR-1 Supabase client + localStorage fallback · src/decisions.js — AR-4 logDecision()
- src/*.test.js + src/components/*.test.jsx — Vitest suites (import real modules; no copies)
- vite.config.js — Vite + Vitest config (jsdom env, include/exclude)
- supabase/migrations/ — SQL schema · scripts/alert.py — daily email alert
- .github/workflows/ — daily-alert + supabase-keepalive crons

## Project Documents (docs/)
- PROJECT-BRIEF.md — vision, architecture, data model, LLM safety rules
- MASTER-BACKLOG.md — all backlog items with priority, status, sprint
- DECISION-LOG.md — architecture + financial-logic decisions with rationale
- WEB-DEV-MENTAL-MODELS.md — web dev concepts + friction points for this stack
- LEARNING-LOG.md — running log for the builder's understanding (append after every change)
- LEARNING-WORKFLOW.md — the learning prompts + log-entry format to use each session

## Workflow
**Before starting:** read this file (auto-loaded), then MASTER-BACKLOG.md for current priorities.
Reference PROJECT-BRIEF.md for financial/LLM logic and DECISION-LOG.md before architecture choices.

**After completing a backlog item:** (1) update its status + completion date in MASTER-BACKLOG.md;
(2) add any new architecture/financial decision to DECISION-LOG.md; (3) update PROJECT-BRIEF.md if
architecture/data-model/principles changed; (4) append a dated entry to LEARNING-LOG.md following
the prompts and format in LEARNING-WORKFLOW.md (run them automatically, don't wait to be asked).

## Comments Convention
Add thorough comments on financial logic, written as if explaining to a Python developer who
doesn't know React.
