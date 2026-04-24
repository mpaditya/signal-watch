# Web Development Mental Models
## A Foundational Guide for Project Artha

**PURPOSE:** Build correct intuitions about how modern web apps work — frontend, backend, runtimes, builds, hosting, and how they fit together. Written for a Data Science manager with Python experience but no prior web development background.

---

## 1. The Big Picture

A modern web app has several independent layers. Each does one job. Understanding what runs where is the single most important concept in web development.

| Layer | What It Does | Where It Runs |
|---|---|---|
| Frontend (UI) | Everything the user sees and clicks. HTML, CSS, JS. Handles forms, displays data, animations. | In the user's browser, after files are downloaded |
| Frontend hosting | Delivers the compiled frontend files to browsers on request. | A static file server (GitHub Pages, Netlify, Vercel, S3) |
| Backend | Logic that must be kept secret: API keys, database credentials, business rules that users shouldn't tamper with. | On a server (traditional or serverless) |
| Database | Persistent storage. Goals, signals, decisions, user accounts. | Managed cloud DB (Supabase, Firebase, PlanetScale) |
| Scheduled jobs | Code that runs at specific times regardless of user activity. Your 6:30pm IST email alert. | A cron service (GitHub Actions, Supabase Scheduled Functions) |
| External APIs | Services you consume: Claude/OpenAI for LLM, mfapi.in for NAV data, Resend for email. | Third-party servers (not your concern, just API endpoints) |

**Important truths to internalise:**

- **Frontend code runs in the browser.** After the user downloads it, your server has no role in executing it. This is why static hosting (just serving files) is enough for frontends.
- **Backend code runs on a server.** Never in the browser. This is where secrets (API keys, database credentials) live safely.
- **A "server" is just a computer that's always on and responds to requests.** It could be a massive data centre or a Raspberry Pi on your desk. The difference is scale, not concept.
- **Static hosting is different from application hosting.** GitHub Pages serves files. It doesn't run code on the server. Your React app is a bundle of files that gets sent to the browser, where the browser runs them.

---

## 2. Runtimes: Python vs JavaScript

A runtime is the software that actually executes your code. Without a runtime, code is just text. The same language can have multiple runtimes (CPython, PyPy for Python). JavaScript has runtimes for browsers and for servers.

| Concept | Python World | JavaScript World |
|---|---|---|
| The language | Python | JavaScript |
| The reference runtime | CPython | V8 (in Node.js and Chrome) |
| Where code runs by default | Your terminal / server | In browsers (Chrome, Firefox, Safari) |
| Runtime for servers / scripts | CPython (default) | Node.js |
| Alternative runtimes | PyPy, Jython, MicroPython | Deno, Bun |
| How you invoke it | `python main.py` | `node script.js` |
| Package manager | pip | npm (or yarn, pnpm) |
| Typical UI library | Tkinter, PyQt, Streamlit | React, Vue, Svelte |
| Typical build tool | PyInstaller, Nuitka | Vite, Webpack, esbuild |

**Key insight:** JavaScript originally only ran in browsers. In 2009, Node.js was created to let JavaScript run on servers and laptops too. This is why modern build tools (like Vite) can be written in JavaScript and run on your laptop — they use Node.js as their runtime.

**Another key insight:** You don't "install" a JavaScript runtime in the browser. Every browser has one built in (V8 in Chrome, SpiderMonkey in Firefox). This is why browsers can run JavaScript directly without additional setup.

---

## 3. The Two Builds: Development vs Production

When you write React code, browsers can't run it directly. React uses JSX — a syntax that mixes HTML-like code into JavaScript. Browsers only understand plain JavaScript. So JSX must be converted ("compiled" or "built") to plain JavaScript before a browser can run it.

Vite is the tool that does this conversion. Vite itself is a JavaScript program, so it runs on Node.js. This is the only reason Node.js is in the picture at all — you need it to run Vite.

But the build happens twice, in two different contexts, for two different reasons:

| Build Context | Where | Purpose | Output Characteristics |
|---|---|---|---|
| Development build | Your laptop, via `npm run dev` | Fast iteration while coding | Large, verbose, hot-reloads on save, includes debug info |
| Production build | GitHub Actions, via `npm run build` | Deploy to users | Tiny, minified, optimised, stripped of debug info |

- The **local dev build** is optimised for YOUR experience as a developer. Hot reloading, clear error messages, verbose output. You don't mind that it's large because only you use it.
- The **production build** is optimised for your USERS' experience. Minified (smaller file sizes), no debug info, bundled for fewer network requests. You wouldn't want to develop with this version because errors would be cryptic and there'd be no hot reload.

This is why we run the build twice: once locally for iteration speed, and once during deployment for user experience. Same code, different output targets.

---

## 4. Why React Doesn't Bundle Its Own Compiler

You might wonder: if React needs JSX compilation, why doesn't React just include the compiler? Then you wouldn't need Vite or Node.js at all.

The answer reveals a general pattern in software: **specialised tools compose better than monolithic ones.**

Compilation isn't just converting JSX. Modern web development involves many transformations:
- Bundling multiple files into fewer
- Removing unused code ("tree shaking")
- Minifying JavaScript to be smaller
- Handling images and CSS
- Code splitting for faster page loads
- Hot module replacement for dev experience

Each of these is a whole problem with its own complexity. Build tools like Vite specialise in all of this.

If React bundled a basic JSX compiler, you'd still need a separate tool for bundling, minification, and optimisation. So you'd still have the "multiple tools" complexity, plus you'd have a less-capable JSX compiler than Vite's. The current design — React for UI, Vite for builds, npm for packages — lets each tool be excellent at its job.

There IS a way to use React with no build tool, using Babel-in-the-browser. It works for tiny apps but is 10x slower and can't use npm packages. Everyone uses the build-tool approach for real projects.

**The Python analogue:** You don't expect Pandas to include Jupyter Notebook, or TensorFlow to include Docker. Each tool does one thing well. Modern tooling ecosystems are composable, not monolithic.

---

## 5. Serverless: What It Actually Means

"Serverless" is a confusing name — there's still a server somewhere. What it really means is: **you don't manage the server, and the server only runs your code when someone calls it.**

Compare to traditional servers:

- **Traditional server:** You rent a Linux VM, install software, run your Node.js process, keep it running 24/7. You pay for the VM whether anyone uses it or not. You handle updates, crashes, scaling.
- **Serverless:** You upload a function. It sits idle (costs nothing). When a request comes in, the platform spins up a container, runs your function, returns the response, shuts down. You pay only for the time it actually ran. No server management.

For personal apps, serverless is nearly always the right choice. You have maybe 100 LLM calls per day, not 100,000. Running a dedicated server 24/7 for 100 calls is wasteful. Serverless bills you for 5 seconds of compute, 100 times a day.

**Serverless limitations to know:**

- **Cold starts:** If a function hasn't run recently, the first call takes 1-3 seconds extra to "wake up." Subsequent calls within minutes are fast.
- **Execution time limits:** Free tiers typically allow 10-150 seconds per function. Netlify and Vercel Hobby give 10 seconds. Supabase Edge Functions give 150 seconds. For LLM calls (which take 2-10 seconds), all of these work.
- **Memory and CPU limits:** Functions get limited resources. Fine for API proxying and light computation, not for heavy workloads like video processing.

---

## 6. Project Artha Architecture

Now that the concepts are clear, here's how your specific app is structured:

| Component | Role in Project Artha |
|---|---|
| Browser (user's device) | Your React app runs here after download. All Signal Watch math, UI, charts. No secrets. |
| GitHub Pages | Hosts the compiled frontend files. Free, unlimited, global CDN. Only serves static files. |
| Supabase (Sprint 3+) | Postgres database, authentication (magic link), and Edge Functions. Backend lives here. |
| Supabase Edge Functions | Short-lived serverless code. Holds LLM API keys. Called by frontend when AI features are used. |
| GitHub Actions | Runs the build on every push. Also runs scheduled jobs (daily email alert at 6:30pm IST). |
| External services | mfapi.in (free NAV data), Resend (free email), Claude/Gemini APIs (LLM calls, via Edge Functions). |

The split-layer architecture (frontend on GitHub Pages, backend on Supabase) is how modern web apps are built. ChatGPT's website, Notion, Linear, Vercel's own site — they all follow this pattern. You're not using an amateur setup; you're using the industry-standard architecture at the scale appropriate for a personal project.

---

## 7. End-to-End Flow: What Happens When

| When | What Happens | Who is Involved |
|---|---|---|
| You're coding | Write React code in VS Code / Claude Code. Run `npm run dev`. Test in browser on localhost:5173. | Your laptop, Node.js, Vite |
| You push code | `git push` sends code to GitHub. | Your laptop, GitHub |
| GitHub receives push | Actions workflow triggers automatically. Runs `npm ci`, `npm run build`, deploys `dist/` to `gh-pages` branch. | GitHub Actions, Node.js, Vite (all running on GitHub's servers) |
| Deployment completes | GitHub Pages serves the new `dist/` files at mpaditya.github.io/signal-watch. | GitHub Pages |
| User visits app | Browser requests URL. GitHub Pages serves HTML/CSS/JS files. Browser downloads and runs them. | User's browser, GitHub Pages |
| App fetches NAV | React code calls mfapi.in API from browser. Free public API, no key needed. | User's browser, mfapi.in |
| User opens chat (S2+) | React calls Supabase Edge Function (via fetch). Function reads API key secret, calls Claude API, returns response. | User's browser, Supabase Edge Function, Claude API |
| User logs in (S3+) | User enters email. Supabase sends magic link. User clicks. Supabase issues JWT. Browser stores JWT. | User's browser, Supabase Auth, user's email inbox |
| User saves a goal (S3+) | React calls Supabase JS SDK. SDK sends request with JWT. Supabase validates JWT, writes to Postgres. | User's browser, Supabase Auth, Supabase Postgres |
| Daily alert fires | GitHub Actions cron triggers at 1pm UTC. Python script fetches NAV, computes signals, sends email via Resend. | GitHub Actions, mfapi.in, Resend, your email inbox |

---

## 8. Build and Deploy Flow Diagram

The canonical sequence for every code change:

```
YOU WRITE CODE (in Claude Code / VS Code)
      |
      v
npm run dev   ----->  Vite dev server on localhost:5173
(for local testing)    (hot reload, debug info)
      |
      v
git add / commit / push
      |
      v
GITHUB RECEIVES PUSH
      |
      +---> .github/workflows/deploy.yml triggers
      |           |
      |           v
      |     Actions runner (cloud VM on GitHub's infra)
      |           |
      |           +---> npm ci (install deps)
      |           +---> npm run build (Vite production build)
      |           +---> dist/ folder produced
      |           +---> push dist/ to gh-pages branch
      |
      v
GITHUB PAGES SERVES gh-pages BRANCH
(mpaditya.github.io/signal-watch)
      |
      v
USER VISITS URL (browser, phone, anywhere)
      |
      +---> Browser downloads HTML/CSS/JS
      +---> JS runs in browser
      +---> App fetches NAV from mfapi.in (client-side)
      +---> App renders signals, goals, verdicts
```

---

## 9. Known Friction Points and How We Handle Them

A second-opinion architectural review raised six practical issues that real developers hit when building on this stack. Each is genuine, each has a known mitigation. This section documents them so you can look up the rationale later without re-litigating the architecture.

### 9.1 Supabase Free Tier Pauses After 1 Week of Inactivity

**The concern:** Supabase's free tier pauses your database after 7 days of no activity. The next visitor hits a dead DB and the app breaks until you manually resume it in the Supabase dashboard.

**Our mitigation:** When Sprint 3 begins (Supabase migration), we add a GitHub Actions cron job that pings the Supabase REST endpoint every 5 days. It's a 10-line YAML file. Free, reliable, fires forever. This should be the FIRST thing built during Sprint 3, before any user-facing features that depend on the database.

### 9.2 React Router Breaks on GitHub Pages with Direct URLs

**The concern:** If the app adds multiple pages (chat, goal details, portfolio), React Router is needed for navigation. But if a user bookmarks `mpaditya.github.io/signal-watch/chat` and visits that URL directly, GitHub Pages looks for a folder named "chat", doesn't find it, and returns a 404 error.

**Our mitigation:** Use `HashRouter` instead of `BrowserRouter`. URLs become `mpaditya.github.io/signal-watch/#/chat` — slightly uglier but works zero-config on GitHub Pages. Alternative: a 404.html redirect trick that keeps clean URLs but is hackier. HashRouter is the right call for a personal app. Before Sprint 2 begins, confirm with Claude Code which router is in use and switch to HashRouter if needed.

### 9.3 LLM Streaming Responses

**The concern:** Without streaming, the user types a question and stares at a blank screen for 5-15 seconds while the full LLM response is generated, then sees it appear all at once. Modern chatbots (ChatGPT, Claude.ai) stream tokens as they're generated — this feels dramatically more responsive.

**Our mitigation:** During Sprint 2 (in-app chat panel), explicitly instruct Claude Code: "The LLM response must stream token-by-token from the Edge Function to the UI. Do not use the simple fetch-and-wait pattern." Supabase Edge Functions support streaming responses; it just needs to be explicitly implemented rather than defaulted to the simpler batch pattern.

### 9.4 CORS Errors (Cross-Origin Resource Sharing)

**The concern:** When the React app at `mpaditya.github.io` calls a Supabase Edge Function at `yourproject.supabase.co`, the browser enforces a security check called CORS. If the Edge Function doesn't return specific headers explicitly allowing requests from the GitHub Pages domain, the browser silently blocks the request. Error messages in the browser console are cryptic. This is the #1 "why is my chatbot broken?!" moment in web development.

**Our mitigation:** Every Edge Function we create must include CORS headers allowing requests from the GitHub Pages domain. During Sprint 2, when building the first Edge Function, explicitly tell Claude Code: "Include proper CORS headers in the response to allow requests from mpaditya.github.io." Once the pattern is established in one function, Claude Code will replicate it for all subsequent functions.

### 9.5 Development Workflow Friction

**The concern:** It's tempting to test every change by pushing to GitHub and checking the live URL. This triggers a 2-3 minute GitHub Actions build for each tiny iteration. Slow, wasteful, and was the real cause of the Netlify credit burn (not Netlify's fault — the real issue was the rapid iteration loop through cloud deployment).

**Our mitigation:** Run `npm run dev` locally while coding. Changes appear in the browser in under a second (hot reload). Do 95% of testing locally. Only push to GitHub Pages when you have something meaningful to test on mobile or confirm in the real production environment. This single practice eliminates the iteration-loop problem regardless of which hosting platform is used.

### 9.6 Supabase Edge Function Cold Starts

**The concern:** Like all serverless functions, Edge Functions sleep when not used. The first call after idle takes 2-5 extra seconds to "wake up" before your LLM call even starts. For a portfolio demo, the first chat message after a period of inactivity feels sluggish.

**Our mitigation:** Same keep-alive approach as the database pausing issue. A GitHub Actions cron job pings the Edge Function every few days to keep a warm instance running. Combine it with the DB keep-alive ping so both are kept warm by the same workflow.

### 9.7 Recommended Pre-Sprint-2 Audit

Before starting Sprint 2 (chat panel + first Supabase integration), spend 30 minutes with Claude Code doing a readiness audit:

1. Confirm which routing library is in use (`BrowserRouter` or `HashRouter`). Switch to `HashRouter` if needed.
2. Verify navigation works when directly visiting a URL (not just clicking from home page).
3. Confirm `npm run dev` works and hot-reloads correctly on the laptop.
4. Review current folder structure and confirm what gets deployed to GitHub Pages.
5. Confirm the Supabase account is set up and a free-tier project is created.

This 30-minute audit prevents the four most common "why is this broken?" moments before they happen in the middle of building a feature.

---

## 10. Glossary

| Term | Plain-English Definition |
|---|---|
| Runtime | The software that actually executes your code. CPython runs Python. Node.js runs JavaScript. Browsers have their own built-in JS runtime. |
| Build tool | A program that transforms your source code into optimised output files for deployment. Vite is a build tool. PyInstaller is a build tool. |
| Compilation / Build | The process of running a build tool. Takes source code in and produces output artefacts. |
| Frontend | The visible, interactive part of the app. Runs in the user's browser. |
| Backend | Server-side code that holds secrets and secure business logic. Runs on a server, not in the browser. |
| Server | A computer (usually in the cloud) that's always on and responds to requests. Can serve files (static server) or run code (application server). |
| Static hosting | Serving pre-made files (HTML/CSS/JS) without running any code on the server. Fast, cheap, simple. GitHub Pages is static hosting. |
| Serverless function | Server-side code that runs on demand and shuts down when done. You don't manage the server. Supabase Edge Functions, Vercel Functions. |
| API | A way for two pieces of software to talk to each other. mfapi.in has an API that returns NAV data. Claude has an API that returns AI responses. |
| API key | A secret string that proves you're authorised to use an API. Must be kept private. |
| Database | Persistent, structured storage for your app's data. Postgres is a database. Supabase provides Postgres as a service. |
| CDN | Content Delivery Network. Distributes your files to servers around the world so users far from the origin get fast downloads. |
| JSX | A syntax extension for JavaScript that lets you write HTML-like code inside JS. React uses it. Browsers don't understand it, so Vite compiles it away. |
| SPA | Single-Page Application. A web app that loads one HTML file and uses JavaScript to swap content as the user navigates, rather than loading new pages. |
| JWT | JSON Web Token. A secure string that proves a user is logged in. Issued by an auth service, included in every subsequent request. |
| Magic link | Authentication method where you click a link in your email to log in. No password needed. Security depends on email account security. |
| Cron | A scheduled job. Runs at a specific time or interval. Your daily email alert is a cron job. |
| npm | Node.js package manager. Used to install JS libraries and run scripts defined in package.json. |
| package.json | File in your project root that lists dependencies and scripts. Like `requirements.txt` + `Makefile` for JavaScript. |
| Git | Version control. Tracks changes to your code over time. GitHub is a hosted service built on top of Git. |

---

## 11. Mental Models to Internalise

1. **Frontend is files. Backend is code running somewhere.** This single distinction explains most of modern web development.

2. **Your laptop is only needed during development and build.** Once deployed, your app runs entirely on cloud infrastructure. You can shut your laptop, go on holiday, and the app keeps serving users.

3. **Secrets belong on servers, never in frontend code.** Anything compiled into your React app is visible to every user who views the page source. API keys, passwords, database credentials — all of these must stay on the backend.

4. **Static hosting is the simplest, cheapest, most reliable frontend option.** It should be the default. Only move to server-based hosting if you have a specific reason (server-side rendering, server-side routing).

5. **Serverless for backend is the simplest, cheapest, most reliable backend option for personal apps.** Only move to traditional servers if you have a specific reason (long-running processes, websockets, very high throughput).

6. **Build tools are separate from runtimes.** Vite isn't part of React. Node.js isn't part of your deployed app. These are development tools that produce output that users' browsers can run.

7. **Same code can have multiple build outputs.** Development builds prioritise your experience. Production builds prioritise users' experience. Both are legitimate, both happen automatically.

8. **Modern web apps are composed of independent services.** Frontend hosting, backend functions, database, auth, scheduled jobs, external APIs. Each is a separate concern, often from a separate provider. The art is in choosing and connecting them.

This composition pattern is the same skill as building a Data Science pipeline: connecting data sources, transformations, models, and outputs. You already think this way. You're just learning new names for familiar concepts.
