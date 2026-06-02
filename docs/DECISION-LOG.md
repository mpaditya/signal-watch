\*\*PROJECT ARTHA — Decision Log\*\*	v5  |  April 2026  |  Confidential



\*\*PROJECT ARTHA\*\*



Decision Log  |  Architecture \& Financial Logic Decisions  |  v5  |  April 2026



This document tracks BUILD decisions — “why did we choose Supabase?”, “why proper compounding?”. NOT the in-app investment decisions audit log.



\*\*v5 CHANGES: +9 new decisions (DEC-023 through DEC-031). New Security category added. DEC-001 superseded by DEC-023 (GitHub Pages). DEC-010 superseded by DEC-024 (Claude Code).\*\*



\# Decision Log



Entries are chronological. New decisions appended at the bottom. Decisions added in v5 are marked NEW. Status: Implemented, Pending, Reversed, or Superseded.



| \*\*#\*\* | \*\*Date\*\* | \*\*Category\*\* | \*\*Decision\*\* | \*\*Context\*\* | \*\*Options Considered\*\* | \*\*Rationale\*\* | \*\*Status\*\* |

| --- | --- | --- | --- | --- | --- | --- | --- |

| \*\*DEC-001\*\* | Mar 26 | \*\*Architecture\*\* | \*\*Netlify over Vercel for hosting\*\* | Needed free-tier static site hosting. | Vercel (setup issues), Netlify (worked), GitHub Pages. | Netlify worked immediately. Free tier: 300 build min/month. | \*\*Superseded by DEC-023\*\* |

| \*\*DEC-002\*\* | Mar 26 | \*\*Architecture\*\* | \*\*Resend over Gmail SMTP for email\*\* | Gmail App Password auth was unreliable. | Gmail SMTP, Resend API, SendGrid. | Single HTTP call, reliable, free 3,000 emails/month. | \*\*Implemented\*\* |

| \*\*DEC-003\*\* | Mar 26 | \*\*Architecture\*\* | \*\*GitHub Actions for scheduled alerts\*\* | Need daily automated email at 6:30pm IST. | GitHub Actions, AWS Lambda, Vercel cron. | Zero cost, no server, 2,000 free min/month. | \*\*Implemented\*\* |

| \*\*DEC-004\*\* | Mar 26 | \*\*Data Model\*\* | \*\*localStorage for config persistence\*\* | Single-user tool needs session persistence. | localStorage, Supabase, JSON file. | Appropriate for single-user. No backend until signal history needed. | \*\*Implemented\*\* |

| \*\*DEC-005\*\* | Mar 26 | \*\*Provider\*\* | \*\*mfapi.in for NAV data\*\* | Need reliable free MF NAV data. | mfapi.in, AMFI direct CSV, paid APIs. | Free, public, no auth, reliable. One daily NAV. | \*\*Implemented\*\* |

| \*\*DEC-006\*\* | Mar 26 | \*\*Architecture\*\* | \*\*React + Vite over plain HTML\*\* | App growing beyond simple HTML. | Plain HTML, React + Vite, Next.js. | Component reuse. Recharts for charts. Vite for fast builds. | \*\*Implemented\*\* |

| \*\*DEC-007\*\* | Apr 26 | \*\*Signal Logic\*\* | \*\*Rolling avg deviation as primary signal\*\* | Need a signal to identify meaningful NAV dips. | Rolling avg, Bollinger Bands, Fixed threshold. | Tunable via period and threshold. Easy to validate. | \*\*Implemented\*\* |

| \*\*DEC-008\*\* | Apr 26 | \*\*Financial Rule\*\* | \*\*Goal-aware advice tiers based on horizon\*\* | Same signal should produce different advice per goal horizon. | Uniform advice, Time-based tiers, Dynamic risk. | Five tiers from Imminent (<2Y) to Long (>15Y). | \*\*Implemented\*\* |

| \*\*DEC-009\*\* | Apr 26 | \*\*Architecture\*\* | \*\*Supabase (Postgres) as target database\*\* | Need relational DB for goals, signal history, audit log. | Supabase, Firebase, PlanetScale. | Open-source (no lock-in), free 500MB, React SDK, built-in auth. | \*\*Pending\*\* |

| \*\*DEC-010\*\* | Apr 26 | \*\*Architecture\*\* | \*\*Superseded: Codespaces as primary dev env\*\* | Was evaluating Codespaces vs local Node.js. | Local Node.js, Codespaces, Hybrid. | Originally chose Codespaces. Superseded by DEC-024. | \*\*Superseded by DEC-024\*\* |

| \*\*DEC-011\*\* | Apr 26 | \*\*Data Model\*\* | \*\*Decisions audit log for investment tracking\*\* | No way to validate if signal rules produce better outcomes. | No tracking, manual spreadsheet, in-app audit log. | Auto-fills 30d/90d NAV. Computes outcome return. Essential for system validation. | \*\*Pending\*\* |

| \*\*DEC-012\*\* | Apr 26 | \*\*Financial Rule\*\* | \*\*7 goal categories with type-specific rules\*\* | Different goals need different CAGR, horizon, equity cutoff. | Single generic goal type vs 7 distinct types. | Each has default CAGR, horizon, equity cutoff, non-negotiable flag. | \*\*Implemented\*\* |

| \*\*DEC-013\*\* | Apr 26 | \*\*Financial Rule\*\* | \*\*Off-track engine: 5 levers with type-priority\*\* | Need corrective action suggestions when goals are off-track. | Generic levers vs type-specific priority order. | Priority order varies by goal type. Deterministic logic. | \*\*Implemented\*\* |

| \*\*DEC-014\*\* | Apr 26 | \*\*UX\*\* | \*\*Required CAGR shown only when amber/red\*\* | Showing required CAGR for healthy goals adds noise. | Always show vs show only when actionable. | Reduces noise for healthy goals. Surfaces when actionable. | \*\*Implemented\*\* |

| \*\*DEC-015\*\* | Apr 26 | \*\*Data Model\*\* | \*\*Refined goal schema for v4 localStorage\*\* | Need richer schema for corpus tracking and goal types. | Extend v3 schema vs new v4 schema with migration. | yearsLeft computed not stored. goalType added. Migration function. | \*\*Implemented\*\* |

| \*\*DEC-016\*\* | Apr 26 | \*\*Data Model\*\* | \*\*CAS upload separate from Goal Compass\*\* | CAS parsing is different from goal stress-testing. | Combined agent vs separate backlog items. | Different doc type, parsing logic, purpose. AG-3A created. | \*\*Pending\*\* |

| \*\*DEC-017\*\* | Apr 26 | \*\*Financial Rule\*\* | \*\*Allocation targets deferred to AG-1/AG-4\*\* | Fund-to-goal mapping suffices for now. | Add allocation targets now vs defer. | Not needed until Portfolio Pulse and Fund Finder. | \*\*Pending\*\* |

| \*\*DEC-018\*\* | Apr 26 | \*\*Financial Rule\*\* | \*\*RDs/FDs in corpus as lump value\*\* | How to account for fixed income instruments in goal corpus. | Per-instrument tracking vs lump value. | Predictable returns. Lumping is sound for projections. AE-4 for breakdown. | \*\*Pending\*\* |

| \*\*DEC-019\*\* | Apr 26 | \*\*Financial Rule\*\* | \*\*Proper compounding for SIP projections\*\* | Most Indian MF calculators use simplified annual/12. | (1+annual)^(1/12)-1 vs annual/12. | \~8% more conservative over 20Y. Deliberate for financial planning. | \*\*Implemented\*\* |

| \*\*DEC-020\*\* | Apr 26 | \*\*Data Model\*\* | \*\*Soft delete (abandon) for goals\*\* | Need to remove goals without breaking data. | Hard delete vs soft delete via status. | Hard delete deferred to Supabase. Zeroing out is poor workaround. | \*\*Pending (SW-9)\*\* |

| \*\*DEC-021\*\* | Apr 26 | \*\*Architecture\*\* | \*\*Bridge architecture for goal health dashboard\*\* | Need v4 features without breaking v3 signal system. | Full rewrite vs bridge layer. | GoalDashboard converts legacy format on-the-fly. Full v4-native deferred to AR-1. | \*\*Implemented\*\* |

| \*\*DEC-022\*\* | Apr 26 | \*\*Signal Logic\*\* | \*\*Neutral signals check horizon for derisking\*\* | Neutral signals showed “no action” even for imminent goals. | Keep neutral as-is vs add horizon check. | Material financial safety improvement. Goals within equity cutoff get derisk warning. | \*\*Implemented\*\* |

| \*\*DEC-023\*\* | Apr 26 | \*\*Architecture\*\* | \*\*NEW: GitHub Pages over Netlify for hosting\*\* | Netlify burning 50% of 300 build credits in first week of active dev. Unsustainable as features increase. | Continue Netlify (risk hitting limit), Cloudflare Pages (500 builds/mo), GitHub Pages (unlimited, free). | GitHub Pages: unlimited builds, free, auto-deploy via GitHub Actions (already used for alerts). No preview URLs for branches, but local dev server (npm run dev) covers this for solo developer. | \*\*Pending\*\* |

| \*\*DEC-024\*\* | Apr 26 | \*\*Architecture\*\* | \*\*NEW: Claude Code + local Node.js for development\*\* | Chat-based copy-paste workflow was slow (hours per feature). Peers using CLI agents report 3-5x productivity. | Continue Claude.ai chat, Gemini CLI (free), Claude Code (Enterprise). | Claude Code via Enterprise plan: zero personal cost, best code quality, reads entire codebase. Local Node.js eliminates Codespaces hour limits. CLAUDE.md provides persistent project context. | \*\*Implemented\*\* |

| \*\*DEC-025\*\* | Apr 26 | \*\*Architecture\*\* | \*\*NEW: Multi-LLM cascade as P1 core requirement\*\* | App needs LLM for chat/agents. Single provider = single point of failure. Free tiers can change. | Hardcode Claude API vs build abstraction layer early. | Provider abstraction layer (AR-5) promoted to P1. Built into first LLM feature (SW-4). Cascade: primary free tier → secondary free tier → cached stale response → deterministic-only mode. Every feature must work without LLM. | \*\*Pending\*\* |

| \*\*DEC-026\*\* | Apr 26 | \*\*Security\*\* | \*\*NEW: LLM response validation layer\*\* | LLMs can produce plausible but wrong financial recommendations. Weaker free-tier models increase this risk. | Trust LLM output vs validate deterministically before display. | Every actionable recommendation sanity-checked: SIP caps, CAGR consistency, timeline bounds, risk limits. If validation fails, show deterministic calculation with override note. Log discrepancies. | \*\*Pending\*\* |

| \*\*DEC-027\*\* | Apr 26 | \*\*Security\*\* | \*\*NEW: Data minimisation for LLM prompts\*\* | Free-tier LLM APIs may use input data for training. App sends financial goals, SIPs, corpus values. | Send raw data vs anonymise/aggregate before sending. | Never send absolute rupee amounts, specific fund names, or personal identifiers. Use percentages, ratios, time horizons. Programmatic prompt templates enforce anonymisation. Applies to ALL providers. | \*\*Pending\*\* |

| \*\*DEC-028\*\* | Apr 26 | \*\*Architecture\*\* | \*\*NEW: CLAUDE.md for project context\*\* | Uploading 3 documents every Claude session is cumbersome and error-prone. | Continue manual uploads vs CLAUDE.md in repo root. | CLAUDE.md contains condensed project context. Claude Code reads it automatically. Also works as handoff documentation when Enterprise access ends. | \*\*Implemented\*\* |

| \*\*DEC-029\*\* | Apr 26 | \*\*Architecture\*\* | \*\*NEW: Build-phase vs run-phase cost separation\*\* | Was conflating “free tier” for dev tools with “free tier” for production dependencies. | Single cost constraint vs separate build/run analysis. | Build-phase: Claude Code via Enterprise (zero personal cost now, not needed post-build). Run-phase: all dependencies must have free tier or open-source alternative. App must work at ₹0/month after build is complete. | \*\*Implemented\*\* |

| \*\*DEC-030\*\* | Apr 26 | \*\*Architecture\*\* | \*\*NEW: Build own LLM orchestration, no frameworks\*\* | Need multi-agent architecture. Evaluated LangGraph, CrewAI, AutoGen, MCP servers. | LangGraph (heavyweight, frequent breaking changes), CrewAI/AutoGen (enterprise-scale), MCP server (premature without backend), Build own thin abstraction (simple, full learning). | Custom provider abstraction + agent modules. \~200-300 lines. Each agent is a JS module calling callLLM(). No framework dependency. Maximises learning. MCP server evaluated post-Supabase migration (P3). | \*\*Pending\*\* |

| \*\*DEC-031\*\* | Apr 26 | \*\*Security\*\* | \*\*NEW: LLM traceability and tool-call audit log\*\* | Need to trace what LLMs do internally: tools called, I/O, reasoning, token usage. Essential for debugging agents and comparing model quality. | No logging (flying blind), Console-only logging (temporary), Full Supabase trace table (complete audit trail). | Console-log traces during Sprint 2 (chat panel). Full Supabase llm\_traces table in Sprint 3. Captures: provider, model, prompt, response, tool calls, latency, tokens, validation pass/fail. Essential for multi-model quality comparison. | \*\*Pending\*\* |

| \*\*DEC-032\*\* | Apr 24, 2026 | \*\*Architecture\*\* | \*\*Keep Codespaces as backup dev environment; Local Node.js preferred when available\*\* | Codespaces was the original dev environment (DEC-010). Claude Code integrates better with local Node.js — no hour limits, faster file access, native hot reload. | Continue Codespaces as primary, Local Node.js, Hybrid (local primary / Codespaces fallback). | Local Node.js chosen as primary. Codespaces retained as backup when local env unavailable. Claude Code running locally with npm installed. | \*\*Implemented\*\* |

| \*\*DEC-033\*\* | Apr 16, 2026 | \*\*Architecture\*\* | \*\*peaceiris/actions-gh-pages@v4 for GitHub Pages deployment\*\* | Executing DEC-023 (GitHub Pages over Netlify). Needed a deploy action for the CI pipeline. | peaceiris/actions-gh-pages@v4 (10K+ stars, most popular), JamesIves/github-pages-deploy-action, manual gh-pages push script. | Chose peaceiris — most widely used GH Pages deploy action. Triggers on push to main, runs npm ci + npm run build, deploys dist/ to gh-pages branch. Added SPA routing fix via public/404.html redirect pattern. Vite base set to /signal-watch/ for correct asset paths. | \*\*Implemented\*\* |

| \*\*DEC-034\*\* | Apr 16, 2026 | \*\*Financial Rule\*\* | \*\*Conviction scoring: 5-factor weighted model for dip prioritisation\*\* | When multiple funds show Buy Dip simultaneously, user needs guidance on where to deploy a lump sum. Need a systematic scoring model, not ad-hoc gut feel. | Single-factor ranking (dip depth only), Equal allocation across all dips, Multi-factor weighted model. | 5-factor weighted model: dip depth 30%, market P/E 20%, drawdown from 52W high 15%, goal horizon 20%, goal health 15%. Weights chosen to prioritise signal quality (dip depth) while ensuring goal context shapes the recommendation. Emergency funds excluded from equity dips entirely (score=0). Goals <2Y also excluded (capital preservation). Suggested amounts proportional to scores, rounded to ₹500. | \*\*Implemented\*\* |

| \*\*DEC-035\*\* | Apr 24, 2026 | \*\*Architecture\*\* | \*\*HashRouter over BrowserRouter for GitHub Pages\*\* | GitHub Pages serves static files and cannot handle direct URL navigation with BrowserRouter — it looks for literal folder paths (e.g., /signal-watch/chat) and returns 404. This breaks bookmarked multi-page URLs. | BrowserRouter + 404.html redirect trick (clean URLs, hackier), HashRouter (URLs become #/chat, zero-config on GitHub Pages). | HashRouter chosen — right tradeoff for a personal app. Zero configuration required. Clean URLs deferred until custom domain or server-side routing is available. Migrate BEFORE Sprint 2 adds routes. See SW-10. | \*\*Pending (SW-10)\*\* |

| \*\*DEC-036\*\* | Apr 24, 2026 | \*\*Architecture\*\* | \*\*GitHub Actions keep-alive for Supabase free tier\*\* | Supabase free tier pauses the database after 7 days of inactivity. Next visitor hits a dead DB; app breaks until manually resumed in Supabase dashboard. | Upgrade to Supabase Pro ($25/month), Add GH Actions cron ping every 5 days. | GH Actions ping chosen — zero cost, same infrastructure already used for daily email alerts. A single workflow pings both the DB REST endpoint and any Edge Functions to keep both warm. Must be built FIRST in Sprint 3. See SE-8. | \*\*Pending (SE-8)\*\* |



\# How to Use This Document



\- Add a new row immediately when a significant decision is made. Don’t batch updates.



\- When a decision is reversed or superseded, don’t delete the old entry. Change Status to “Reversed” or “Superseded by DEC-XXX”.



\- When starting a new Claude session, upload this alongside the Project Brief and Master Backlog.



\- Signal Logic and Financial Rule decisions deserve extra scrutiny — they directly affect investment recommendations.



\- Security decisions (DEC-026, DEC-027) are non-negotiable design requirements, not optional features.



