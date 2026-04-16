# Project Artha — Claude Code Context

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
4. VALIDATE LLM OUTPUTS — every actionable recommendation sanity-checked by deterministic rules before display (SIP caps, CAGR consistency, timeline bounds, risk limits)
5. USEFUL WITHOUT LLM, BETTER WITH — every feature must work if all LLMs are unavailable
6. NO PAID LOCK-INS — all run-phase dependencies must have free tier or open-source alternative
7. RESILIENT BY DESIGN — graceful degradation if any API (Claude, NSE, mfapi) fails
8. PROPER COMPOUNDING — SIP projections use r = (1+annual)^(1/12)-1, NOT annual/12

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
- Response validation layer sits between LLM output and user display
- Build own orchestration — no LangGraph, no CrewAI, no heavyweight frameworks
- Traceability: log every LLM call with provider, model, prompt, response, tool calls, tokens

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
- src/goalUtils.test.js — 35 financial math unit tests
- scripts/alert.py — daily email alert script
- .github/workflows/daily-alert.yml — GitHub Actions cron schedule

## Project Documents (in repo)
Three living documents in docs/ define all project decisions, priorities, and architecture:
- docs/PROJECT-BRIEF.md — Vision, architecture, design principles, data model, LLM safety rules
- docs/MASTER-BACKLOG.md — All 41 backlog items with priority, status, sprint assignments
- docs/DECISION-LOG.md — 31 architecture and financial-logic decisions with rationale

IMPORTANT: Before starting any work session:
1. Always read CLAUDE.md (this file) first — it loads automatically
2. Read docs/MASTER-BACKLOG.md to confirm current sprint priorities and item status
3. Reference docs/PROJECT-BRIEF.md when implementing any financial logic or LLM feature
4. Reference docs/DECISION-LOG.md when making architecture choices to avoid re-litigating past decisions

After completing any backlog item:
1. Update the item's status in docs/MASTER-BACKLOG.md (change "Not Started" to "Done", add completion date)
2. If a new architecture or financial-logic decision was made during implementation, add it to docs/DECISION-LOG.md with date, context, options considered, and rationale
3. If the change affects architecture, data model, or design principles, update docs/PROJECT-BRIEF.md

## Comments Convention
When writing code, add thorough comments explaining financial logic. Write comments as if explaining to a Python developer who doesn't know React.
