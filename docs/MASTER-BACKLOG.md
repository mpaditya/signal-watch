**PROJECT ARTHA — Master Backlog**	v5  |  April 2026  |  Confidential

**PROJECT ARTHA**

Master Backlog  |  v5  |  April 2026  |  Owner: mpaditya  |  Status: Active Development

**v5 CHANGES: SW-1 and SW-2 marked DONE. AR-4, AR-5 promoted to P1. +5 new items (AR-7, AR-10, SE-5, SE-6, SE-7). New Security category for LLM safety items. DEC-023 through DEC-029 added.**

## Priority & Status Legend

| **Priority** | **Meaning** |
| --- | --- |
| **P0 — Now** | Build immediately. Highest financial or architectural value. |
| **P1 — Next** | Build as soon as P0 items are done. |
| **P2 — Soon** | Important but not urgent. Build within 2–3 months. |
| **P3 — Later** | Valuable but can wait. Build when core platform is stable. |
| **P4 — Future** | Long-term vision. Park until Phase 3–4. |

| **Status** | **Meaning** |
| --- | --- |
| **Not Started** | In backlog, no work begun. |
| **In Progress** | Active development. |
| **DONE / LIVE** | Feature shipped and live. Completion date recorded. |
| **Blocked** | Cannot proceed. Dependency specified. |
| **Deferred** | Consciously postponed with a reason. |

## Backlog Summary

P0 (Now): 3 items  |  P1 (Next): 9 items  |  P2 (Soon): 11 items  |  P3 (Later): 12 items  |  P4 (Future): 6 items  |  DONE: 3 items  |  Total: 44 items

Current focus: AR-7 GitHub Pages migration + SW-3 Dip prioritisation.

# Full Backlog

Grouped by functional area. Sprint assignments: S1 = current, S2–S5 = planned. ‘—’ = unscheduled.

| **#** | **Backlog Item** | **Priority** | **Status** | **Phase** | **Started** | **Done** | **Sprint** | **Notes** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **SIGNAL WATCH ENHANCEMENTS** |
| **SW-1** | **Dynamic add/delete goals** | **P0 — Now** | **DONE** | 1 | Apr 26 | Apr 26 | S1 | 7 goal types, CRUD, corpus tracking, off-track engine. Shipped Apr 2026. |
| **SW-2** | **Start date + corpus tracking** | **P0 — Now** | **DONE** | 1 | Apr 26 | Apr 26 | S1 | Projections, health scoring, staleness nudges, off-track levers. Shipped Apr 2026. |
| **SW-3** | **Dip prioritisation + funds** | **P0 — Now** | **DONE** | 1 | Apr 26 | Apr 16, 2026 | S1 | 5-factor conviction scoring (dip depth, P/E, drawdown, horizon, health). Lump sum allocation ranked table. 12 new unit tests. DEC-034 added. |
| **SW-4** | **In-app chat panel** | **P1 — Next** | **Not Started** | 1-2 | — | — | S2 | Lightweight chat: “why this signal?” First Claude API tool-use integration. MUST use multi-LLM abstraction (AR-5) and validation layer (SE-5). |
| **SW-5** | **Category comparison** | **P2 — Soon** | **Not Started** | 1 | — | — | — | Compare 1M/3M return vs category average. |
| **SW-6** | **Goal type-specific glide path** | **P2 — Soon** | **Not Started** | 1 | — | — | — | Different derisking per goal type. Equity cutoff per Brief §4.2. |
| **SW-7** | **NSE P/E multi-source fallback** | **P3 — Later** | **Not Started** | 1 | — | — | — | Try Screener.in, Trendlyne before estimated values. |
| **SW-8** | **Email alert: per-signal toggle** | **P3 — Later** | **LIVE** | 1 | Mar 26 | Mar 26 | v3 | Per-fund mute is live. Consider per-signal-type toggles. |
| **SW-9** | **Goal abandon/archive** | **P2 — Soon** | **Not Started** | 1 | — | — | S2 | Soft delete via status=abandoned. Hard delete deferred to AR-1. |
| **SW-10** | **HashRouter for multi-page navigation** | **P1 — Next** | **Not Started** | 1-2 | — | — | S2 | GitHub Pages returns 404 on direct URL navigation with BrowserRouter. Switch to HashRouter BEFORE adding chat panel or other routes. See Brief 3.5 friction #2. DEC-035. |
| **ARCHITECTURE ****&**** INFRASTRUCTURE** |
| **AR-1** | **Supabase migration (Postgres)** | **P1 — Next** | **Not Started** | 2 | — | — | S3 | Free tier. Replaces localStorage. Adds signal_history + decisions tables. |
| **AR-2** | **Authentication (magic link)** | **P1 — Next** | **Not Started** | 2 | — | — | S3 | Email magic link via Supabase Auth. Required before cloud DB stores financial data. |
| **AR-3** | **Signal history table + persist** | **P1 — Next** | **Not Started** | 2 | — | — | S3 | GH Actions writes daily signals to Supabase. Enables trend detection. |
| **AR-4** | **Decisions audit log table** | **P1 — Next** | **Not Started** | 2 | — | — | S3 | PROMOTED from P2. Log every action: fund, amount, signal, 30d/90d outcome. See Brief §4.5. |
| **AR-5** | **Multi-LLM abstraction layer** | **P1 — Next** | **Not Started** | 1-2 | — | — | S2 | PROMOTED from P2. Provider abstraction, rate-limit detection, fallback cascade, response routing. MUST be built before SW-4. See DEC-025 and Brief §6.1. |
| **AR-6** | **CLAUDE.md + .devcontainer.json** | **P1 — Next** | **DONE** | 1 | Apr 26 | Apr 16, 2026 | S1 | CLAUDE.md created with full project context. .claude/settings.json for auto-permissions. .devcontainer.json deferred. |
| **AR-7** | **GitHub Pages migration** | **P0 — Now** | **DONE** | 1 | Apr 26 | Apr 16, 2026 | S1 | Migrated from Netlify to GitHub Pages. peaceiris/actions-gh-pages@v4 deploys dist/ to gh-pages on push to main. SPA 404 routing via public/404.html. DEC-033 added. |
| **AR-8** | **Serverless backend functions** | **P3 — Later** | **Not Started** | 2 | — | — | — | Netlify Functions / Supabase Edge Functions for agent API calls. |
| **AR-9** | **Environment variable mgmt** | **P3 — Later** | **Not Started** | 2 | — | — | — | Move secrets to Supabase vault for runtime API keys. |
| **AI AGENTS — PHASE 2** |
| **AG-1** | **Portfolio Pulse Agent** | **P2 — Soon** | **Not Started** | 2 | — | — | S5 | Allocation tracker, XIRR, drift alerts. Deterministic math + LLM narrative layer. |
| **AG-2** | **Goal Compass Agent** | **P3 — Later** | **Not Started** | 2 | — | — | S5+ | Stress-tests plans: inflation, lifestyle creep. Deterministic calcs + LLM devil’s advocate. |
| **AG-3** | **Document upload for Goal Compass** | **P3 — Later** | **Not Started** | 2 | — | — | S5+ | Upload insurance, salary, tax docs. Agent grounds advice in real documents. |
| **AG-3A** | **CAS statement upload + parsing** | **P2 — Soon** | **Not Started** | 2 | — | — | S3-4 | Parse CAMS/KFintech CAS PDF. Auto-update corpus per goal. |
| **AG-4** | **Fund Finder Agent** | **P3 — Later** | **Not Started** | 3 | — | — | S5+ | Reverse-engineer CAGR → fund category → specific schemes. |
| **AG-5** | **Stock Sage Agent** | **P4 — Future** | **Not Started** | 3-4 | — | — | — | Multi-persona debate. Needs Screener.in data. Most complex AI pattern. |
| **ANALYTICS ****&**** INSIGHTS** |
| **AN-1** | **Signal trend detection** | **P2 — Soon** | **Not Started** | 2 | — | — | S4 | Requires signal history DB. Detect sustained dips vs noise. |
| **AN-2** | **Portfolio performance dashboard** | **P3 — Later** | **Not Started** | 2-3 | — | — | — | XIRR per fund, per goal, overall. Benchmark vs index. |
| **AN-3** | **SIP vs lump sum outcome tracker** | **P3 — Later** | **Not Started** | 2-3 | — | — | — | Hypothetical: ‘if you had lump-summed on this Buy Dip signal, you’d be up X%.’ |
| **AN-4** | **Net worth aggregation** | **P4 — Future** | **Not Started** | 3-4 | — | — | — | Manual entry for gold, real estate, FDs, EPF. |
| **AN-5** | **XIRR-based actual return calc** | **P2 — Soon** | **Not Started** | 2 | — | — | S4-5 | Compute XIRR per fund, per goal, overall. |
| **ASSET CLASS EXPANSION** |
| **AE-1** | **Gold/Silver monitoring** | **P4 — Future** | **Not Started** | 4 | — | — | — | MCX/commodity APIs. Different signal logic. |
| **AE-2** | **Real Estate tracker** | **P4 — Future** | **Not Started** | 4 | — | — | — | Manual entry: property values, rental yield. |
| **AE-3** | **Fixed income tracker** | **P4 — Future** | **Not Started** | 4 | — | — | — | FDs, EPF, PPF, NPS. |
| **AE-4** | **RD/FD instrument-level tracking** | **P3 — Later** | **Not Started** | 3 | — | — | — | Per-instrument detail for RDs/FDs. |
| **UX ****&**** DELIVERY CHANNELS** |
| **UX-1** | **Mobile-responsive UI** | **P2 — Soon** | **Not Started** | 1-2 | — | — | — | App works but not optimised for mobile. |
| **UX-2** | **PWA setup** | **P3 — Later** | **Not Started** | 2 | — | — | — | Offline capability, home screen install. |
| **UX-3** | **WhatsApp bot for alerts** | **P4 — Future** | **Not Started** | 3-4 | — | — | — | Twilio / WhatsApp Business API. |
| **UX-4** | **Dark/light theme toggle** | **P3 — Later** | **Not Started** | 1 | — | — | — | CSS variables exist. Add user toggle. |
| **SECURITY ****&**** RESILIENCE** |
| **SE-1** | **Graceful degradation for APIs** | **P1 — Next** | **In Progress** | 1 | Mar 26 | — | S2 | mfapi.in, NSE, Claude API must fail gracefully. Partially done for P/E. |
| **SE-2** | **Rate limiting on Claude API** | **P2 — Soon** | **Not Started** | 2 | — | — | S4 | Hard cap on daily API calls. Prevent runaway costs. |
| **SE-3** | **Data export / backup** | **P2 — Soon** | **Not Started** | 2 | — | — | S3 | One-click export to JSON. Essential before DB migration. |
| **SE-4** | **Content Security Policy** | **P3 — Later** | **Not Started** | 2 | — | — | — | Netlify headers for XSS protection. |
| **SE-5** | **LLM response validation layer** | **P1 — Next** | **Not Started** | 1-2 | — | — | S2 | NEW: Every actionable LLM recommendation sanity-checked by deterministic rules. SIP caps, CAGR consistency, timeline/risk bounds. See DEC-026, Brief §6.3. |
| **SE-6** | **Data minimisation for LLM prompts** | **P1 — Next** | **Not Started** | 1-2 | — | — | S2 | NEW: Anonymise financial data before sending to LLM APIs. Prompt templates enforce no raw amounts, no fund names, no PII. See DEC-027, Brief §6.2. |
| **SE-7** | **LLM traceability + tool-call audit** | **P2 — Soon** | **Not Started** | 2 | — | — | S3-4 | NEW: Log every LLM call: provider, model, prompt (post-anonymisation), response, tool calls I/O, latency, tokens, validation pass/fail. Console-log in S2, Supabase table in S3. |
| **SE-8** | **Supabase keep-alive ping (GH Actions)** | **P1 — Next** | **Not Started** | 2 | — | — | S3 | Supabase free tier pauses DB after 7 days inactivity. GH Actions cron pings DB + Edge Functions every 5 days. Build FIRST in Sprint 3 before any user-facing Supabase features. See Brief 3.5 friction #1 and #6. DEC-036. |
| **SE-9** | **Pre-Sprint-2 readiness audit** | **P0 — Now** | **Not Started** | 1-2 | — | — | S1-2 | 30-min audit before Sprint 2. Verify: (1) router type — switch to HashRouter, (2) direct URL nav works, (3) npm run dev hot-reload works, (4) Supabase project set up. See Brief 3.5. |
| **AR-10** | **Evaluate MCP server for tools** | **P3 — Later** | **Not Started** | 2-3 | — | — | — | NEW: After Supabase migration, evaluate building an MCP server to expose financial tools (goal projections, signal queries, portfolio calcs) for use by any MCP-compatible agent. |

# Recommended Build Sequence

- **Sprint 1 (Current):** AR-7 + SW-3 — GitHub Pages migration, then dip prioritisation. SW-1, SW-2 are DONE. AR-6 (CLAUDE.md) in progress.

- **Sprint 2:** SW-10 + AR-5 + SE-5 + SE-6 + SW-4 + SW-9 + SE-1 — HashRouter migration first, then multi-LLM layer, validation layer, data minimisation, in-app chat, goal abandon, graceful degradation. LLM safety infrastructure built BEFORE first LLM feature.

- **Sprint 3:** AR-1 + AR-2 + AR-3 + AR-4 + SE-3 — Supabase migration, auth, signal history, decisions audit log, data export.

- **Sprint 4:** AN-1 + AN-5 + SE-2 — Signal trend detection, XIRR, rate limiting.

- **Sprint 5+:** AG-1 through AG-5 — Agent builds in order: Portfolio Pulse → Goal Compass → Fund Finder → Stock Sage.

Page