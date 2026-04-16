\*\*PROJECT ARTHA\*\*	v5  |  Comprehensive Project Brief  |  April 2026



\*\*PROJECT ARTHA\*\*



Personal AI Finance Co-pilot  |  Comprehensive Project Brief  |  v5  |  April 2026



| PURPOSE: A multi-agent AI system for smarter personal investing — from asset allocation and goal planning to mutual fund selection, stock analysis, and real-time NAV alerts. Built as a personal project to simultaneously deliver genuine financial utility and deepen hands-on AI development expertise. |

| --- |



| v5 CHANGES: Added LLM Safety Architecture (§6), migrating hosting from Netlify to GitHub Pages, adopted Claude Code + CLAUDE.md for development, added data minimisation design principle, added LLM response validation layer, promoted multi-LLM abstraction to P1 core requirement. |

| --- |



\# 1. Vision \& Overarching Goals



Project Artha (‘wealth, purpose and meaning’ in Sanskrit) is a self-built personal finance platform powered by AI agents. It serves two goals simultaneously: delivering real financial value for the builder’s own portfolio, and providing a hands-on curriculum in modern AI-led development.



\## 1.1 The Five Agent Modules



| \*\*#\*\* | \*\*Agent\*\* | \*\*Priority\*\* | \*\*What It Does\*\* | \*\*AI Pattern\*\* |

| --- | --- | --- | --- | --- |

| 01 | Signal Watch | LIVE | Daily NAV monitoring, dip/run/neutral signals, email alerts | Rule engine + scheduled script |

| 02 | Portfolio Pulse | Next | Tracks allocation vs targets, flags drift, glide-path nudges | Thinking agent + tool use |

| 03 | Goal Compass | Planned | Devil’s advocate on financial plans, stress-tests assumptions | Reasoning agent |

| 04 | Fund Finder | Planned | Maps required CAGR to fund category and specific schemes | Research agent + web search |

| 05 | Stock Sage | Future | Multi-persona debate: value vs momentum vs quality analysts | Parallel agents + orchestrator |



\## 1.2 Core Design Principles



\- \*\*You decide, AI advises\*\* — no agent executes transactions. All output is recommendation + reasoning.



\- \*\*Goal-first, not return-first\*\* — all analysis is anchored to specific goals and timelines.



\- \*\*Build to learn\*\* — each phase introduces a new AI development pattern, growing complexity deliberately.



\- \*\*All responses must be well thought out\*\* in a comprehensive, financially-sound manner.



\- \*\*Resilient by design\*\* — app must degrade gracefully, not break, if any external dependency (Claude API, NSE, mfapi) fails.



\- \*\*No paid lock-ins\*\* — every dependency must have a free tier or open-source alternative. Build-phase tools (Claude Code via Enterprise) are distinct from run-phase dependencies (which must be zero-cost).



\- \*\*NEW: Data minimisation for LLM prompts\*\* — never send raw financial amounts, specific fund names, or personally identifiable data to LLM APIs. Anonymise and aggregate before sending. See §6.2.



\- \*\*NEW: Validate before display\*\* — every actionable financial recommendation from any LLM must pass through a deterministic sanity-check layer before being shown to the user. See §6.3.



\# 2. Current Implementation Status



\## 2.1 Signal Watch v4 — LIVE



\*\*Deployed at: mpaditya.github.io/signal-watch\*\*



\### Features Implemented (v3 base)



\- Live NAV fetch for 8 funds from mfapi.in (free, public, no auth).



\- Rolling average deviation signal: Buy Dip / Watch / Strong Run / Neutral / Stable.



\- 52-week high drawdown displayed per fund (-10% and -20% thresholds highlighted).



\- Market P/E overlay with NSE India live fetch and estimated fallback.



\- Synthesised per-goal verdict combining NAV signal + market P/E band + goal horizon.



\- Goal-aware advice tiers: Long (>15Y), Long (10-15Y), Medium (5-10Y), Short (2-5Y), Imminent (<2Y).



\- Editable Goals \& SIPs panel with localStorage persistence.



\- Configurable rules: rolling avg period and dip threshold.



\- Goal filter tabs. Daily email alert via GitHub Actions. Auto-deploy pipeline.



\### NEW in v4: Goal Health Dashboard (SW-1 + SW-2)



\- Dynamic goal creation with 7 goal types: car, house, travel, education, wedding, retirement, emergency. Each type has pre-filled defaults for CAGR, horizon, equity cutoff, and target flexibility.



\- Corpus tracking with staleness nudges (amber >30 days, red >60 days since last update).



\- Projection engine using proper compounding formula: (1+annual)^(1/12)-1.



\- On-track health scoring: Green (>90%), Amber (70-90%), Red (<70%). Required CAGR shown only for Amber/Red goals per DEC-014.



\- Off-track recommendation engine with 5 levers in goal-type-specific priority order.



\- Goal CRUD: create, edit, update corpus. Abandon/archive for cleanup.



\- Bridge architecture: GoalDashboard reads existing goalsConfig format and converts to v4 schema on-the-fly.



\### NEW in v4: Neutral Signal Derisking



Signal verdicts now check goal horizon even for neutral signals. Previously, a 2-year goal with equity exposure would show “no action needed” on neutral NAV days. Now correctly warns to derisk when within the equity cutoff window, regardless of signal type.



\### Funds Tracked



| \*\*Fund\*\* | \*\*Category\*\* | \*\*Goals\*\* | \*\*Alert\*\* |

| --- | --- | --- | --- |

| Nippon India Small Cap | Small Cap | Retirement + Education | On |

| HDFC Small Cap | Small Cap | Retirement + Education | On |

| HDFC Mid-Cap Opportunities | Mid Cap | Retirement + Education | On |

| Nippon India MultiCap | Multi Cap | Retirement only | On |

| HDFC Flexi Cap | Flexi Cap | Retirement + Education | On |

| Mirae Asset Large \& Midcap | Large \& Mid Cap | Retirement + Education | On |

| SBI Arbitrage Opportunities | Arbitrage | Emergency Fund | OFF |

| SBI Small Cap | Small Cap | Retirement + Education | On |



\# 3. Architecture \& Tech Stack



\## 3.1 Current Stack (v5)



| \*\*Layer\*\* | \*\*Technology\*\* | \*\*Notes\*\* |

| --- | --- | --- |

| Frontend | React 18 + Vite + Recharts | Single-page app, all logic in-browser |

| Styling | Inline CSS with CSS variables | No Tailwind — avoids CDN dependency |

| State / Storage | React state + localStorage | Config in artha\_config\_v1, corpus in artha\_goal\_corpus |

| NAV Data | mfapi.in (free, public REST API) | No auth required. 1 NAV per fund per day. |

| Market P/E | NSE India API (with fallback) | Often blocked; falls back to estimated values |

| Email Alerts | Python script + Resend API | Free tier: 3,000 emails/month |

| Scheduling | GitHub Actions (cron) | Free. 2,000 minutes/month on free tier. |

| Hosting | \*\*GitHub Pages (free, unlimited)\*\* | NEW in v5: Migrating from Netlify. Zero build limits. |

| Version Control | GitHub (mpaditya/signal-watch) | Source of truth |

| Dev Environment | \*\*Local Node.js + Claude Code\*\* | NEW in v5: Claude Code via Enterprise. CLAUDE.md for context. |



\## 3.2 Development Workflow (NEW in v5)



\*\*Build-phase development uses Claude Code via Enterprise plan. A CLAUDE.md file in the repo root provides full project context to every Claude Code session automatically — no manual document uploads needed.\*\*



Workflow: Open terminal → cd signal-watch → claude → describe task → agent reads codebase + CLAUDE.md → writes files → review → npm run dev (test locally) → git push (deploys to GitHub Pages in \~90 seconds).



Post-build maintenance does not require Claude Code. Claude.ai free tier chat is sufficient for small fixes and dependency updates. The codebase, CLAUDE.md, and the three project documents serve as the handoff/KT package.



\## 3.3 Deployment (NEW in v5: GitHub Pages)



Migrating from Netlify (which was burning through 300 build credits/month during active development) to GitHub Pages (unlimited, free). See DEC-023.



GitHub Actions workflow (.github/workflows/deploy.yml) will run npm run build on every push to main and deploy the dist/ folder to the gh-pages branch. Site will be live at mpaditya.github.io/signal-watch within 60–90 seconds of push.



For local testing before push: npm run dev (localhost). For mobile testing on same WiFi: npm run dev --host (exposes on LAN IP).



GitHub Pages deploys from one branch only. There are no branch-specific preview URLs like Netlify. For a solo developer, local testing with npm run dev is the preview step before pushing to production.



\## 3.4 Target Architecture (When DB Is Needed)



The current localStorage-based config will strain as we add: signal history, multi-device access, transaction tracking. Recommended migration: Supabase (free tier Postgres) replacing localStorage for all persistent data. Supabase Edge Functions for serverless backend. Keep GitHub Pages for frontend hosting.



| DECISION PENDING: Evaluate Supabase when (a) signal history feature (AR-3) is genuinely needed, OR (b) multi-device sync is desired. |

| --- |



\# 4. Data Model (Current + Target)



\## 4.1 Current Data Model — v4 Schema



Three localStorage keys are used: artha\_config\_v1 (legacy goals config), artha\_goal\_corpus (per-goal corpus tracking), artha\_goals\_v4 (extra goals created via GoalDashboard).



\## 4.2 Goal Categories \& Financial Rules



| \*\*Type\*\* | \*\*Icon\*\* | \*\*CAGR\*\* | \*\*Horizon\*\* | \*\*Fixed?\*\* | \*\*Eq. Off\*\* | \*\*Notes\*\* |

| --- | --- | --- | --- | --- | --- | --- |

| 🚗 car |  | 10% | 3-5Y | No | <2Y | Depreciating asset. Most flexible goal. |

| 🏠 house |  | 11% | 5-10Y | Semi | <3Y | Typically largest corpus. May include RDs. |

| ✈️ travel |  | 9% | 1-3Y | No | <1Y | Short horizon = conservative instruments. |

| 🎓 education |  | 12% | 10-20Y | Yes | <5Y | Non-negotiable. Inflation-adjusted. |

| 💍 wedding |  | 11% | 10-25Y | Semi | <3Y | Long horizon but scope-flexible. |

| 🏖️ retirement |  | 12% | 15-30Y | Yes | <3Y | Longest horizon, most compound growth. |

| 🛡️ emergency |  | 7% | 1-2Y | Yes | Never | No equity EVER. Debt/liquid/arbitrage only. |



\## 4.3 Off-Track Recommendation Engine



When a goal is off-track (projected corpus < target), the system suggests corrective actions with 5 levers in goal-type-specific priority order. This is deterministic rule logic — no AI needed.



Lever 1: Increase SIP. Lever 2: Extend timeline. Lever 3: Reduce target (flexible goals only). Lever 4: Deploy lump sum. Lever 5: Accept higher risk (last resort, only if horizon >10Y and required CAGR <15%).



| \*\*Goal Type\*\* | \*\*Fixed?\*\* | \*\*Off-Track Lever Priority\*\* |

| --- | --- | --- |

| education | Yes | SIP increase → Lump sum → Extend timeline (if child young) → NEVER reduce |

| retirement | Yes | SIP increase → Extend retirement age (sensitive!) → Lump sum → Higher return if >10Y |

| emergency | Yes | SIP increase → Lump sum only. No timeline extension. Debt-only. |

| house | Semi | SIP increase → Extend timeline → Lump sum → Reduce target |

| wedding | Semi | SIP increase → Extend timeline → Reduce target → Lump sum |

| car | No | Reduce target → SIP increase → Extend timeline |

| travel | No | Reduce target → Extend timeline → SIP increase |



\## 4.4 SIP Projection Formula



The app uses proper compounding for monthly rate conversion: r = (1 + annual)^(1/12) - 1. This is mathematically correct but produces \~8% lower projections over 20 years compared to the simplified r = annual/12 used by Groww, ET Money, and most Indian MF calculators. This conservative approach is deliberate. See DEC-019.



\## 4.5 Decisions Audit Log (In-App Investment Tracking)



\*\*Every investment action taken based on a system recommendation gets logged. 30 and 90 days after each action, the system auto-fills the NAV and computes the outcome return. This is the single most important table for long-term system validation.\*\*



| \*\*Field\*\* | \*\*Type\*\* | \*\*Description\*\* |

| --- | --- | --- |

| id | uuid | Unique decision record identifier |

| date | date | Date the investment action was taken |

| fundId | string | Which fund was invested in |

| goalId | string | Which goal this investment was for |

| action | enum | SIP / Lump Sum / Redemption / Switch / Hold |

| amount | number | Amount in INR |

| triggerSignal | string | The signal that prompted the action (e.g., Buy Dip -8.2%) |

| triggerPE | string | Market P/E context at time of action |

| convictionScore | number | Composite conviction score (0-100) |

| navAtAction | number | NAV on the date of action |

| navAfter30d | number | NAV 30 days after action (auto-filled by system) |

| navAfter90d | number | NAV 90 days after action (auto-filled by system) |

| outcomeReturn | number | Percentage return vs NAV at action (auto-computed) |

| notes | text | Free text: why you acted, what you were thinking |



\# 5. Open Architecture Decisions



| \*\*Decision\*\* | \*\*Options \*\*\*\*\&\*\*\*\* Recommendation\*\* |

| --- | --- |

| Database | Option A: Supabase (Postgres, free tier). Option B: Continue localStorage. REC: Supabase when signal history is genuinely needed. |

| Claude API for P/E | Currently Haiku with web search fallback. Consider Gemini free tier. |

| Build tool | React + Vite. Next.js only if SSR needed. No migration now. |

| Goal deletion | Soft delete via status=abandoned. Hard delete deferred to Supabase migration. See DEC-020. |



\# 6. LLM Safety Architecture (NEW in v5)



| This section defines the safety boundaries for all LLM-dependent features. Every agent and chat feature MUST comply with these requirements. This is a financial application — bad LLM output can lead to bad investment decisions. |

| --- |



\## 6.1 Multi-LLM Cascade Architecture



\*\*Every LLM call in the application goes through a provider abstraction layer (AR-5, promoted to P1). This layer handles provider selection, rate-limit detection, automatic fallback, and response validation. No feature may call an LLM API directly — all calls go through the abstraction.\*\*



Cascade order (configurable): Primary: best-quality free-tier model (currently Claude free API or Gemini Pro free). Secondary: next free-tier model. Tertiary: cached last response (labelled as stale). Final fallback: deterministic-only mode (no LLM, numbers and flags only).



Design principle: every agent feature must be USEFUL without the LLM, and BETTER with it. Signal Watch is pure math. Portfolio Pulse computes allocation drift and XIRR deterministically; the LLM adds the narrative explanation. Goal Compass runs stress-test calculations deterministically; the LLM adds the conversational devil’s advocate layer. If all LLMs are unavailable, the user still gets numbers and flags.



This architecture also protects against free tiers disappearing. If any provider changes their pricing, the cascade simply skips that provider. The app never breaks.



\## 6.2 Data Minimisation for LLM Prompts



\*\*Free-tier LLM APIs typically reserve the right to use input data for model training. This application sends financial data (goals, SIP amounts, corpus values) to these APIs. Data minimisation is therefore a DESIGN REQUIREMENT, not a nice-to-have.\*\*



Rules for all LLM prompts:



\- \*\*Never send absolute rupee amounts.\*\* Instead of “My retirement corpus is ₹45,00,000”, send “My retirement goal is 70% on-track.”



\- \*\*Never send specific fund names.\*\* Instead of “Nippon India Small Cap”, send “a small-cap equity fund.”



\- \*\*Never send personal identifiers.\*\* No name, email, or account numbers in prompts.



\- \*\*Use relative metrics.\*\* Percentages (on-track %, allocation drift %, drawdown %), ratios, and time horizons are safe to send.



\- \*\*Implement prompt templates.\*\* All prompts should be constructed programmatically from templates that enforce anonymisation. No free-text passthrough of user data to LLM.



These rules apply to ALL LLM providers, including paid tiers. The habit of minimisation protects against provider policy changes and data breaches.



\## 6.3 LLM Response Validation Layer



\*\*Every actionable financial recommendation from any LLM must pass through a deterministic sanity-check layer before being shown to the user. This is non-negotiable.\*\*



Validation rules:



\- \*\*SIP recommendations:\*\* Cannot exceed 50% of estimated monthly income (if known) or ₹1,00,000 (hard cap). Must be positive numbers. Must be in round thousands.



\- \*\*Lump sum recommendations:\*\* Cannot exceed available funds (if entered). Cannot be negative.



\- \*\*CAGR claims:\*\* Any CAGR cited by the LLM must be within 1% of the value computed by the deterministic engine. If the LLM says “your goal needs 18% CAGR” but the math says 14%, flag the discrepancy.



\- \*\*Timeline recommendations:\*\* Cannot suggest extending retirement beyond age 70 or education beyond child’s age 25.



\- \*\*Risk recommendations:\*\* Cannot suggest equity allocation for emergency fund goals. Cannot suggest >80% equity for any goal.



If validation fails: show the user the deterministic calculation with a note that the AI recommendation was overridden. Log the discrepancy for review (helps identify which models produce unreliable outputs).



\# 7. How to Continue in a New Session



\## 7.1 Codebase Location



\- GitHub: github.com/mpaditya/signal-watch



\- Live app: mpaditya.github.io/signal-watch



\- Dev environment: Local Node.js + Claude Code (Enterprise)



\## 7.2 Development with Claude Code



A CLAUDE.md file in the repo root contains condensed project context: architecture summary, current sprint focus, key design principles (including LLM safety requirements), data model overview, and key decisions. Claude Code reads this automatically on every session.



To start a session: open terminal in the signal-watch directory and run claude. The agent will read CLAUDE.md and the full codebase. No manual document uploads needed.



\## 7.3 Development with Claude.ai (chat)



If using Claude.ai chat instead of Claude Code (e.g., for planning, brainstorming, or maintenance after Enterprise access ends): upload the Project Brief, Master Backlog, and Decision Log. Start by asking Claude to read and summarise all three, then proceed with the task. Reference specific section numbers or backlog item IDs.



\## 7.4 Key Files



| \*\*File\*\* | \*\*Purpose\*\* |

| --- | --- |

| src/App.jsx | Main React app — signal logic, verdicts, goals config, fund cards |

| src/goalUtils.js | Goal projection math, off-track engine, migration, validation |

| src/components/GoalDashboard.jsx | Bridge component: reads goalsConfig, layers health projections |

| src/components/GoalCard.jsx | Goal health card with status, levers, staleness warnings |

| src/components/GoalForm.jsx | Add/edit goal modal with 7 types, fund mapping, CAGR warnings |

| src/goalUtils.test.js | 35 financial math tests (standalone, no framework) |

| src/index.css | CSS variables, dark mode, base styles |

| scripts/alert.py | Daily email alert Python script |

| .github/workflows/daily-alert.yml | GitHub Actions cron job (6:30pm IST weekdays) |

| .github/workflows/deploy.yml | NEW v5: GitHub Pages auto-deploy on push to main |

| CLAUDE.md | NEW v5: Project context file for Claude Code sessions |



\## 7.5 Push \& Deploy



Every push to main auto-deploys via GitHub Actions to GitHub Pages. For testing before push, use npm run dev locally.



\# 8. Project Management \& Artifact Structure



Project Artha maintains exactly three living documents. This is deliberate: three documents is disciplined. Five documents is bureaucracy for a team of one.



| \*\*Document\*\* | \*\*Update Frequency\*\* | \*\*Purpose\*\* |

| --- | --- | --- |

| Project Brief | Monthly / on major decisions | Vision, architecture, design principles, tech stack, data model. The “what and why.” |

| Master Backlog | Weekly / every sprint | Every feature, prioritised, with status tracking. The “what to build.” |

| Decision Log | On every significant decision | Architecture AND financial-logic decisions with date, context, rationale, outcome. |



\## 8.1 Status Tracking (in Master Backlog)



Every backlog item carries: Status (Not Started / In Progress / Done / Blocked / Deferred), Priority (P0–P4), Phase, Date Started, Date Completed, Sprint tag, and Notes. The backlog is the single source of truth for what’s been built and what’s next.



\## 8.2 When to Update Each Document



\- \*\*Project Brief:\*\* Update when a major architecture decision is finalised, when the data model changes significantly, or when a new agent module is designed.



\- \*\*Master Backlog:\*\* Update at the start and end of every sprint. Add new items as identified. Move items through status transitions.



\- \*\*Decision Log:\*\* Update immediately when any significant decision is made. Don’t batch — context and rationale are freshest at the moment of decision.



Project Artha  |  Confidential Personal Document  |  v5  |  April 2026



Project Artha  |  Confidential Personal Document  |  v5  |  Page

