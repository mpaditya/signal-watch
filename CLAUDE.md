# Project Artha — Claude Code Context

## ⛔ TESTING RULES — NON-NEGOTIABLE (read before writing any test)
These rules are MANDATORY for every build, feature, fix, or refactor. They exist because
a past "one-shot" build shipped test files that never ran and tested fake code.

1. **TEST THE REAL CODE, NEVER A COPY.** Every test MUST `import` the function/component
   from its real module (e.g. `import { projectCorpus } from './goalUtils.js'`). NEVER
   copy/paste/re-declare the code under test inside the test file ("inline copies",
   "simulate the functions", "copied for standalone testing" are all FORBIDDEN). A test
   that defines its own copy of the logic proves nothing.
2. **TESTS MUST ACTUALLY RUN under the project runner.** The runner is **Vitest**
   (`npm test`). Every test file uses `describe/it/expect` from `vitest`. Do NOT invent a
   homemade `console.log`-based assertion harness. If you add a test file, run `npm test`
   and paste the pass/fail output. "Tests written" ≠ "tests pass" — only the runner output counts.
3. **PROVE NEW TESTS HAVE TEETH.** For any non-trivial new test, briefly mutate the real
   code to confirm the test FAILS, then revert. A test that can't fail is theater.
4. **INTEGRATION OVER UNIT FOR UI WIRING.** Logic bugs hide in unit tests passing while the
   feature is broken (button never renders, wrong prop, wrong localStorage key). For any
   component feature, add a React Testing Library test that mounts the REAL component,
   clicks the REAL buttons, and asserts what the user sees.
5. **NEVER REPORT COVERAGE YOU DID NOT RUN.** Do not claim "N tests pass" unless `npm test`
   just printed that. Do not cite test counts from docs as evidence they pass.

Run `npm test` before every commit that touches `src/`. Green must mean green.

## What This Is
Personal AI finance co-pilot for Indian mutual fund investing. Built with React 18 + Vite.
Live at: comforting-dusk-525b9e.netlify.app (migrating to GitHub Pages — see Sprint 1)

## Two Objectives
1. PRIMARY: Help the builder make better investment decisions
2. SECONDARY: Learn AI-driven development and build a production-grade app

## Current Sprint (S1)
- AR-7: Migrate hosting from Netlify to GitHub Pages (Netlify burning build credits)
- SW-3: Dip prioritisation — user enters lump sum, app ranks Buy Dip signals by conviction score

## Architecture
- Frontend: React 18 + Vite + Recharts. Single-page app, all logic in-browser.
- Styling: Inline CSS + CSS variables. No Tailwind, no CSS frameworks.
- State: localStorage (three keys: artha_config_v1, artha_goal_corpus, artha_goals_v4)
- NAV data: mfapi.in (free, public, no auth)
- Market P/E: NSE India API with fallback to estimated values
- Email alerts: Python script + Resend API, triggered by GitHub Actions cron (6:30pm IST weekdays)
- Hosting: Netlify currently. Migrating to GitHub Pages (unlimited builds, free). See DEC-023.
- Dev: Claude Code via Enterprise. This file provides session context.
- DB (future): Supabase free tier Postgres when signal history or multi-device sync needed

## Core Design Principles (MUST follow)
1. YOU DECIDE, AI ADVISES — no agent ever executes transactions
2. GOAL-FIRST — all analysis anchored to specific goals and timelines
3. DATA MINIMISATION — never send raw rupee amounts, specific fund names, or PII to any LLM API. Use percentages, ratios, time horizons only. Enforce via prompt templates.
4. VALIDATE LLM OUTPUTS — every actionable recommendation sanity-checked by deterministic rules before display. Validation layer has two roles: static policy checks (SIP caps, CAGR consistency, timeline bounds, risk limits) AND drift detection (LLM narration vs deterministic tool outputs). Validator is itself rule-based, never an LLM.
5. PLANNER-NARRATOR PATTERN — LLMs sit at the boundaries of agent features (planning + narration), never in the middle. Deterministic code does all math. LLM picks which tested function to call and explains structured outputs in plain English. See DEC-042.
6. USEFUL WITHOUT LLM, BETTER WITH — every feature must work if all LLMs are unavailable
7. NO PAID LOCK-INS — all run-phase dependencies must have free tier or open-source alternative
8. RESILIENT BY DESIGN — graceful degradation if any API (Claude, NSE, mfapi) fails
9. PROPER COMPOUNDING — SIP projections use r = (1+annual)^(1/12)-1, NOT annual/12

## Financial Rules (embedded in goalUtils.js)
- 7 goal types: car, house, travel, education, wedding, retirement, emergency
- Each has: default CAGR, horizon range, equity cutoff period, fixed/flexible flag
- Emergency fund: NO EQUITY EVER. Debt/liquid/arbitrage only.
- Health scoring: Green >=90%, Amber 70-90%, Red <70% on-track
- Off-track engine: 5 levers in goal-type-specific priority order
- Required CAGR shown only for Amber/Red goals (not Green — reduces noise)
- Neutral signals still warn about derisking if goal is within equity cutoff window

## LLM Architecture (for future agent features)
- Multi-LLM cascade: primary free tier → secondary free tier → cached stale → deterministic-only
- Provider abstraction layer handles all LLM calls (no direct API calls from features)
- Planner-narrator pattern: LLM picks tools + explains results, deterministic code computes (DEC-042)
- Response validation layer sits between LLM output and user display — two roles: static policy + drift detection (SE-5)
- Build own orchestration — no LangGraph, no CrewAI, no heavyweight frameworks
- Traceability: log every LLM call with provider, model, prompt, response, tool calls, tokens
- Validation rules grow organically from observed failures via traceability log review (SE-7)

## Key Commands
- npm run dev — local dev server (port 5173)
- npm run build — production build to dist/
- git push — triggers auto-deploy (currently Netlify, will be GitHub Actions → GitHub Pages)

## Key Files
- src/App.jsx — main UI, signal logic, verdicts, fund cards (~880 lines)
- src/goalUtils.js — ALL financial math, projection engine, off-track levers (~850 lines)
- src/components/GoalDashboard.jsx — goal health container, v3↔v4 schema bridge
- src/components/GoalCard.jsx — individual goal health card
- src/components/GoalForm.jsx — add/edit goal modal with 7 types
- src/components/ChatPanel.jsx — floating AI chat panel (SW-4); buildContext() anonymises portfolio
- src/components/LLMSettings.jsx — modal for entering/clearing Gemini API key
- src/llm.js — LLM abstraction layer (AR-5): callLLM(), hasLLMKey(), setLLMKey()
- src/llm.test.js — Vitest suite for the LLM abstraction (imports real ./llm.js)
- src/goalUtils.test.js — Vitest suite for financial math (imports real ./goalUtils.js)
- src/decisions.test.js — Vitest suite for the decisions audit log
- src/supabase.test.js — Vitest suite for the Supabase client + localStorage fallback
- src/components/GoalDashboard.test.jsx — RTL integration test (mounts real component, clicks buttons)
- vite.config.js — also holds Vitest config (jsdom env, include/exclude). Runner: `npm test`
- scripts/alert.py — daily email alert script
- .github/workflows/daily-alert.yml — GitHub Actions cron schedule

## Project Documents (in repo)
Five living documents in docs/ define all project decisions, priorities, and architecture:
- docs/PROJECT-BRIEF.md — Vision, architecture, design principles, data model, LLM safety rules
- docs/MASTER-BACKLOG.md — All 40+ backlog items with priority, status, sprint assignments
- docs/DECISION-LOG.md — 40+ architecture and financial-logic decisions with rationale
- docs/WEB-DEV-MENTAL-MODELS.md — Foundational web dev concepts (runtimes, builds, serverless, CORS, routing) and known friction points for this stack. Read before Sprint 2/3 work or when hitting infrastructure confusion.
- docs/LEARNING-LOG.md — Living record of how things work, built up over time for the builder's understanding (and interview prep). Append a new entry after every meaningful change. See "Learning prompts" and "Learning log format" sections below.

## IMPORTANT: Before starting any work session
1. Always read CLAUDE.md (this file) first — it loads automatically
2. Read docs/MASTER-BACKLOG.md to confirm current sprint priorities and item status
3. Reference docs/PROJECT-BRIEF.md when implementing any financial logic or LLM feature
4. Reference docs/DECISION-LOG.md when making architecture choices to avoid re-litigating past decisions

## After completing any backlog item
1. Update the item's status in docs/MASTER-BACKLOG.md (change "Not Started" to "Done", add completion date)
2. If a new architecture or financial-logic decision was made during implementation, add it to docs/DECISION-LOG.md with date, context, options considered, and rationale
3. If the change affects architecture, data model, or design principles, update docs/PROJECT-BRIEF.md
4. **Append a new entry to docs/LEARNING-LOG.md** explaining what changed in walkthrough format (see "Learning prompts" and "Learning log format" sections below)

## Learning prompts (USE THESE EVERY SESSION)

The builder is a Data Science manager learning web/AI development. Standard outputs aren't enough — every meaningful change should be accompanied by an explicit learning artifact. After making any non-trivial code change, **automatically run all three of these prompts and append the results to docs/LEARNING-LOG.md** under a new dated entry. Do not wait to be asked.

### Walkthrough prompt (run after any code change)
"Walk me through what you just changed. List every file touched and why. Trace the data flow end-to-end: where does the data start, what transforms it, where does it end up rendered? What would break if I removed each piece? Explain it as if I'm a Python developer who's never seen React. Use Python analogies where helpful (e.g. 'useState is like a class instance variable that triggers a re-render when assigned')."

### Mermaid diagram prompt (run for any feature involving 2+ files)
"Generate a Mermaid sequence diagram showing the data flow for [feature]. Include every file, function call, state change, and external API call. Mark each node with its file path. Use participant boxes for: Browser, React component, hook/state, utility module, external API. Show timing where relevant (e.g. async fetches, useEffect triggers)."

### Test-first reading prompt (run when exploring an unfamiliar module)
"Before showing me the implementation of [module], summarise what its tests in [test file] tell us it's supposed to do. List each tested behaviour as a one-line contract. Then show the implementation, and for each function point out which test contract it satisfies. If any function lacks test coverage, flag it."

### Predict-before-running prompt (use when handing back to the builder for testing)
"Before I run npm run dev to test this, write down 3-5 specific predictions about what I should observe. Format: 'When I do X, I expect Y to happen, because Z.' Cover: UI changes, console logs, network requests, localStorage state, error cases. After I test, I'll tell you which predictions held and which didn't — wrong predictions are the highest-value learning signal."

## Comments Convention
When writing code, add thorough comments explaining financial logic. Write comments as if explaining to a Python developer who doesn't know React.

## Learning log format (for docs/LEARNING-LOG.md appends)
Every entry follows this structure:

```
## [YYYY-MM-DD] [Backlog ID or change description]

### What changed
One-paragraph summary of the change.

### Files touched
- path/to/file.ext — what changed and why

### Walkthrough (Python-developer framing)
End-to-end explanation of how the change works in the running app.

### Data flow diagram
\`\`\`mermaid
[diagram]
\`\`\`

### Mental models reinforced
- One-line bullets on what concepts this change reinforced or introduced.

### Open questions
- Things the builder should investigate further to deepen understanding.
```

Always preserve previous entries — only append new ones at the bottom.
