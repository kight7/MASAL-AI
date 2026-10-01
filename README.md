# Masal AI

**AI lead triage for real-estate sales.** Masal AI tells a salesperson which inbound leads to call first, what each customer actually wants, and exactly what to do and say next.

Built for **IQOL Technologies** as a take-home assignment.

| | |
| --- | --- |
| Live app | https://masal-ai-u2f9.vercel.app/ |
| Demo video (3 min) | https://drive.google.com/file/d/12Gi0nQzmmj0TvXWZJS1J11zbMr9bI_Kf/view?usp=drive_link |
| Repository | https://github.com/kight7/MASAL-AI |

![Dashboard](masal-ai/docs/img/dashboard.png)

---

## Try it in 60 seconds

1. Open the live app and click **Load sample leads**. Six fictional Delhi NCR leads are added and analysed one at a time.
2. They land in **Hot**, **Warm** and **Cold** sections, ranked by score, with urgent leads first.
3. Open **Riya Sharma** (Hot, Urgent). The navy box at the top is the recommended next action.
4. Click **Prep for call** to get the questions to ask, what to avoid and the commitment to close on.
5. In **Property matches**, her exact unit is sold out, so the app offers alternatives. Click **Explain & compare** for talking points.
6. Ask the coach on the right: "What should I emphasize on the call?" or "Make my reply more assertive".

No login or setup is needed. All data in the demo is fictional.

---

## What it does

A sales team receives hundreds of leads a day. Masal AI reads each inquiry and gives the salesperson three things at a glance:

- **Which leads matter:** a score from 0 to 100, a Hot / Warm / Cold tier and an Urgent flag, on a dashboard sorted for calling.
- **What the customer wants:** a two-line summary, their real intent, key requirements and concerns.
- **What to do next:** one concrete next action (channel and timeframe), a reply ready to send, a property to pitch, and a call plan.

### How it maps to the brief

| Requirement | Where it is |
| --- | --- |
| 1. Lead intake form (name, location, requirement, budget, timeline, message) | **New lead** dialog, validated with Zod, plus an optional phone or email |
| 2. AI analysis (summary, intent, requirements, objections, next action, suggested response) | One structured AI call per lead (`masal-ai/src/lib/ai/analyze.ts`) |
| 3. Grounded follow-up chat | **Coach** panel on every lead, built from that lead's inquiry, analysis and property matches |
| 4. Multiple saved leads, ranked by AI-produced priority | Supabase Postgres; score, tier and urgent flag; live updates across tabs |
| 5. Scannable in seconds | Next action first, score ring, tier colours with text labels, mobile layout |
| Own feature | Two: **Property Match and Cross-Sell Matrix**, and **Call Prep Notes** (below) |

---

## My features

The brief asked what happens before, during and after this screen. The next action usually says "call". These two features cover the moment before and during that call, which is where an AI voice product sits.

### 1. Property Match and Cross-Sell Matrix

**Problem:** a lead says "3BHK in Sector 62 under 1.5 Cr". The salesperson searches the CRM by hand, and has nothing ready when that unit is sold out.

- **Code picks and scores, not the AI.** `matching.ts` reads budgets the way customers write them ("1.4-1.5 Cr", "80-95 lakh", "Rs 1,50,00,000") and scores every property in the inventory out of 100: budget 40, location 30 (same sector, neighbouring sector, same city), size 20, requested amenities 10.
- **Top 3, never a sold-out unit.** Each is labelled Best fit, Stretch (over budget) or Alternative (nearby area), with factual reasons written by code.
- **Cross-sell.** If the best property overall is sold out, a banner says so and the alternatives are pitched instead.
- **The AI only explains.** **Explain & compare** sends exactly those three properties to the AI, which returns the pitch order, talking points, a watch-out per property, and what to offer if the customer says no. If the AI mentions a property id it was not given, the answer is rejected.
- **Grounded chat.** The coach sees the same matches, so "Which property should I pitch first?" stays grounded.

The inventory is 18 fictional properties in a JSON file. In production it would come from the CRM.

### 2. Call Prep Notes

**Problem:** the next action says "call within 2 hours", but the salesperson still has to work out what to ask.

- **One click:** **Prep for call** in the next-action box produces a one-screen brief.
- **The brief contains:** the call goal; an opening line in the customer's language; 4 to 6 questions, must-ask first, each with why it matters; one matched property to mention; up to 3 things to avoid; and the commitment to close on.
- **Questions target real gaps:** details marked "not stated", objections to test, and budget flexibility when the best unit is sold out.
- **It reads your notes:** it also uses the salesperson's recent chat with the coach. If you noted "she can stretch to 1.6 Cr", the budget question disappears on regenerate.
- **Questions are a checklist** you tick during the call. Ticks are saved, so afterwards you can see what is still unknown.

---

## Architecture

```
 Browser (Next.js pages)                         anon key: read-only
 ┌───────────────────────────┐  ┌──────────────────────────────────────────┐
 │ Dashboard                 │  │ Lead page                                │
 │ ranked list, filters,     │  │ brief, property matrix, call prep,       │
 │ live updates              │  │ coach chat                               │
 └─────────────┬─────────────┘  └────────────────────┬─────────────────────┘
               │      HTTPS: JSON, streamed chat     │            ▲
               ▼                                     ▼            │ Realtime
 Vercel server: Next.js API routes (secret keys, 60 s limit)      │ (row changes)
 ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────┴───────────┐
 │ Leads + re-analyse   │ │ Coach chat           │ │ Matches + call prep      │
 │ insert pending first,│ │ grounded, streamed   │ │ code picks, AI explains  │
 │ then analyse, save   │ │                      │ │                          │
 └──────────┬───────────┘ └──────────┬───────────┘ └─────────────┬────────────┘
            ▼                        ▼                           ▼
 ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────────┐
 │ AI layer             │ │ matching.ts          │ │ Supabase Postgres        │
 │ Gemini, then Groq    │ │ pure code, no AI     │ │ leads, lead_messages     │
 │ 12 s per try, Zod    │ │ 18 mock properties   │ │ Row Level Security       │
 └──────────────────────┘ └──────────────────────┘ └──────────────────────────┘
```

- **One app.** A single Next.js app on Vercel serves the pages and the API routes.
- **Writes go through the server.** Every write goes through a server route using the Supabase service-role key.
- **The browser only reads.** It reads leads through Supabase Realtime with the read-only anon key, so a lead added in one tab appears in another without refreshing.

### Request flow: adding a lead

1. The form validates with Zod and sends `POST /api/leads`.
2. The route checks the hourly usage cap, then **inserts the lead as "pending" first**, so it is never lost.
3. `analyzeLead()` calls Gemini, or Groq if Gemini fails, and gets a structured analysis.
4. Code computes the score and tier, updates the row, and returns the lead.
5. If both AI providers fail, the lead is saved as "failed" with a **Retry** button.

### Tech stack

- Next.js 16 (App Router, TypeScript strict)
- Tailwind CSS and shadcn/ui
- Vercel AI SDK v7 and Zod 4
- Supabase (Postgres and Realtime)
- Vercel Hobby

Everything runs on free tiers.

---

## AI models and how they are called

| | Primary | Fallback |
| --- | --- | --- |
| Provider | Google Gemini (AI Studio free tier) | Groq (free tier) |
| Model | `GEMINI_MODEL`, default `gemini-3.6-flash` | `GROQ_MODEL`, default `openai/gpt-oss-120b` |
| Package | `@ai-sdk/google` | `@ai-sdk/groq` |

Model ids live only in environment variables, so a retired model is a config change, not a code change.

### The four AI calls

| Call | SDK function | File |
| --- | --- | --- |
| Lead analysis | `generateText` with `Output.object({ schema: AnalysisSchema })` | `src/lib/ai/analyze.ts` |
| Coach chat (streamed) | `streamText`, read part by part | `src/lib/ai/providers.ts` (`streamChatWithFallback`) |
| Property match explanation | `generateText` with `MatchExplanationSchema` | `src/app/api/leads/[id]/matches/route.ts` |
| Call prep | `generateText` with `CallPrepSchema` | `src/app/api/leads/[id]/call-prep/route.ts` |

A structured call looks like this:

```ts
const { result, provider } = await runWithFallback(async ({ model, providerOptions, signal }) => {
  const { output } = await generateText({
    model,
    instructions: ANALYSIS_SYSTEM,          // the scoring rubric
    prompt: buildAnalysisPrompt(input),     // lead wrapped in <lead> tags, no contact details
    output: Output.object({ schema: AnalysisSchema }),
    providerOptions,                        // low thinking / reasoning effort for speed
    abortSignal: signal,                    // 12 s per attempt
    maxRetries: 0,                          // fallback is the only retry
  });
  return normalizeAnalysis(AnalysisSchema.parse(output));
});
```

### Scoring: the AI gives sub-scores, code adds them up

- **The AI rates four things, each 0 to 25:** budget fit, timeline urgency, requirement clarity and engagement.
- **Code does the rest:** it clamps each sub-score, adds them up (0 to 100) and sets the tier: Hot 70 or more, Warm 40 to 69, Cold under 40.
- **Why:** a model asked for one number drifts between similar leads. Four narrow questions with a rubric are more consistent, and the breakdown is shown on screen as "Why it scores 86".

The same rule applies to property matching: **code decides the numbers, the AI writes the words.**

### Reliability and safety

- **Fallback.** Any Gemini error (rate limit, timeout, missing key, invalid output) moves to Groq once. The page shows which provider answered.
- **Time budget.** Each attempt has 12 seconds and the SDK's silent retries are off. The worst case of 24 seconds always fits Vercel's 60-second limit.
- **Streaming fallback.** A rate-limit error arrives *inside* a stream, not as an exception. The chat reads the stream part by part and switches provider only if the error comes before the first word.
- **Validation.** Every structured answer is checked with Zod. Size limits are enforced in code, and an invented property id is rejected.
- **Prompt injection.** Customer text is wrapped in `<lead>` tags and labelled as data, never instructions.
- **Privacy.** The phone or email field is stored and shown, but never sent to an AI provider.

---

## Run it locally

**You need:** Node.js 20+, a free [Supabase](https://supabase.com) project, a [Google AI Studio](https://aistudio.google.com) API key and a [Groq](https://console.groq.com) API key.

```bash
git clone https://github.com/kight7/MASAL-AI.git
cd MASAL-AI/masal-ai
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service-role / secret key (server only) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Yes | Google AI Studio key |
| `GEMINI_MODEL` | Yes | e.g. `gemini-3.6-flash` |
| `GROQ_API_KEY` | Yes | Groq key |
| `GROQ_MODEL` | Yes | e.g. `openai/gpt-oss-120b` |
| `ENABLE_DELETE` | No | `true` shows the Delete button (local only) |
| `MAX_LEADS_PER_HOUR` | No | Default 60 |
| `FORCE_FALLBACK` | No | `true` uses Groq only, to demo the fallback |

Create the database: in Supabase, open **SQL Editor**, paste `supabase/schema.sql` and run it. It is safe to run again, and already includes the columns from `migration-5.sql` and `migration-5-2.sql`.

```bash
npm run dev     # http://localhost:3000
```

`api.http` has a ready request for every API route (VS Code REST Client extension).

**Deploying:** import the repo on Vercel, set **Root Directory** to `masal-ai`, and add the same environment variables. Leave out `ENABLE_DELETE`. Full steps are in [`masal-ai/docs/DEPLOY.md`](masal-ai/docs/DEPLOY.md).

---

## Project structure

```
masal-ai/
├── docs/                 CONTRACTS.md (rules + API), PROJECT_STATE.md, DEPLOY.md
├── supabase/             schema.sql, migration-5.sql, migration-5-2.sql
├── api.http              requests for every route
└── src/
    ├── app/              dashboard, lead page, loading/error/not-found
    │   └── api/leads/    create, list, get, delete, reanalyze, chat, messages,
    │                     matches, call-prep, seed
    ├── components/       lead card and list, intake dialog, brief, chat,
    │                     property matrix, call prep, score ring, ...
    ├── data/             inventory.json (18 fictional properties)
    ├── hooks/            use-leads.ts (fetch + Realtime)
    └── lib/
        ├── ai/           schemas, prompts, providers (fallback), analyze
        ├── supabase/     server (service role) and browser (anon) clients
        ├── matching.ts   budget parsing and property scoring (no AI)
        ├── api.ts        route helpers, usage guards
        └── sample-leads.ts
```

---

## Key technical decisions

| Decision | Why |
| --- | --- |
| AI gives four sub-scores, code adds them | Consistent, explainable ranking |
| Code picks properties, AI only explains | Cannot invent a listing; deterministic and testable |
| Gemini first, Groq fallback, 12 s per attempt | Two free providers with separate limits; always inside Vercel's 60 s limit |
| Save the lead before analysing it | A lead is never lost if the AI fails |
| Chat history comes from the database | The browser sends only the newest message and cannot fake earlier ones |
| Re-analyse claims the lead in one conditional update | Two clicks can never start two analyses |
| Sample leads analysed one at a time from the browser | Respects free-tier rate limits; no request near the time limit |
| Budget fit judged on clarity, not market price | The model would otherwise have to guess prices |
| No login; usage caps and a delete switch instead | Reviewers can test with zero setup without draining the AI quota |

---

## Known limitations

- **No login.** Anyone with the public anon key can read leads. This is acceptable for a demo with fictional data; next step is auth with per-user row security.
- **The usage cap is app-wide** (60 new leads per hour), not per visitor.
- **Analysis runs inside the request** (about 5 to 25 seconds). Bulk imports would need a queue.
- **Scores are not yet validated** against real outcomes. Next step is to log conversions and tune the rubric.
- **Chat falls back only before the first word.** An error mid-reply shows "interrupted, try again" rather than switching provider.
- **The inventory is a fictional JSON file,** and location matching is by sector name, not distance.
- **Free tiers have quotas.** When Gemini's daily quota runs out, every call falls back to Groq (shown as "Analysed by Groq (fallback)"). Free Supabase projects pause after about a week idle.

**Next step I would build:** after the call, paste or record the transcript. The AI would update the lead, tick the call-prep questions that were answered, re-score it, and draft the follow-up.

---

## AI usage disclosure

| Tool | What I used it for |
| --- | --- |
| Claude (claude.ai) | Analysing the brief and planning the build in steps; reviewing and fixing my prompt guidebook (timeouts, fallback, scoring rubric, demo guards); generating the code for each step (data layer, API routes, dashboard, lead page, chat, sample data, both custom features); checking installed library versions; pre-deploy audit (build, lint, secrets); debugging setup issues (env variable names, Supabase schema mismatch, Next.js type generation, Vercel access and quota); writing this README and my interview notes |
| ADD ANY OTHER TOOL | e.g. Copilot for autocomplete, ChatGPT for ... |

I reviewed, ran and tested every step before committing, and I can explain every file in this repository.
