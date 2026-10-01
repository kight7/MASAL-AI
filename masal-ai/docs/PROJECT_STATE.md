# LeadLens - Project State

## 1. Status
| Step | Description | Status |
|------|-------------|--------|
| 1.1 | Contracts, database and AI layer | Done |
| 1.2 | API routes | Done |
| 2.1 | Dashboard, intake form, ranked list | Done |
| 2.2 | Lead detail: AI brief + grounded chat | Not started |
| 3.1 | Sample data, error states, polish | Not started |
| 4.1 | Pre-deploy audit + Vercel deploy | Not started |
| 5.1 | Property Match & Cross-Sell Matrix | Not started |
| 5.2 | Call Prep Notes | Not started |
| 6.1 | README, demo script, interview prep | Not started |

## 2. File map
| File | Purpose |
|------|---------|
| docs/CONTRACTS.md | Rules and contracts (single source of truth) |
| docs/PROJECT_STATE.md | This tracker |
| supabase/schema.sql | Tables, indexes, RLS, public SELECT policy on leads, Realtime publication (idempotent) |
| .env.example | Every env var name, empty values |
| src/lib/types.ts | Lead, LeadMessage, LeadStatus, AIProvider; isStalePending() (pending > 90 s) |
| src/lib/ai/schemas.ts | TIMELINES + TIMELINE_LABELS, LeadInputSchema, AnalysisSchema, normalizeAnalysis(), computeScore(), tierFromScore() |
| src/lib/ai/prompts.ts | ANALYSIS_SYSTEM, buildAnalysisPrompt(), buildChatSystem(), toAIView() (the only path lead data takes to a model; drops contact) |
| src/lib/ai/providers.ts | AI_ATTEMPT_TIMEOUT_MS, getPrimaryModel(), getFallbackModel(), getChatModels(), runWithFallback(), streamChatWithFallback(), AIUnavailableError |
| src/lib/ai/analyze.ts | analyzeLead(input) -> { analysis, score, tier, urgent, provider } |
| src/lib/supabase/server.ts | getServerSupabase(): service-role client, server only |
| src/lib/supabase/browser.ts | getBrowserSupabase(): anon client for Realtime only |
| src/lib/api.ts | json(), jsonError(), serverError(), parseBody(), readId(), usage guards (remainingLeadSlots, isDeleteEnabled, MAX_CHAT_MESSAGES_PER_LEAD), getLead(), analyzeAndSave(), claimForReanalysis() |
| src/app/api/leads/route.ts | GET list, POST create (cap -> insert pending -> analyse -> update) |
| src/app/api/leads/[id]/route.ts | GET one, DELETE (403 unless ENABLE_DELETE=true) |
| src/app/api/leads/[id]/reanalyze/route.ts | POST re-analyse (409 if already pending and not stale) |
| src/app/api/leads/[id]/messages/route.ts | GET chat history, oldest first |
| src/app/api/leads/[id]/chat/route.ts | POST streaming chat (UI message stream), saves user + assistant messages, 429 after 30 user messages |
| api.http | REST Client requests for every route, including error cases |
| src/app/layout.tsx | App shell: sticky header (LeadLens wordmark + New lead), Toaster, metadata, IBM Plex Sans |
| src/app/page.tsx | Dashboard: loading / error / empty states, stats filter, ranked list, highlight of a new lead |
| src/hooks/use-leads.ts | Initial fetch + Supabase Realtime; every update is an upsert by id keeping the newest updated_at; LEAD_CREATED_EVENT |
| src/components/intake-dialog.tsx | NewLeadButton + IntakeDialog: Zod validation, inline errors, 429 toast, no double submit |
| src/components/lead-card.tsx | Scannable card (score ring, tier, urgent, summary, budget, timeline, next action); Retry for failed or stale; CHANNEL_META |
| src/components/lead-list.tsx | Sections Needs attention / Hot / Warm / Cold; compareLeads() = urgent, score, newest; 15 s clock for staleness |
| src/components/stats-bar.tsx | Hot / Warm / Cold / Urgent counts that act as toggle filters (aria-pressed) |
| src/components/tier-badge.tsx | TIER_META colours + labels, TierBadge, UrgentFlag |
| src/components/score-ring.tsx | SVG score ring in the tier colour; dashed ring when not scored |

## 3. Decisions
- Installed versions checked (rule R5): ai 7.x, @ai-sdk/google 4.x, @ai-sdk/groq 4.x, zod 4.x, @supabase/supabase-js 2.x. In ai 7, generateObject is deprecated, so analysis uses generateText with output: Output.object({ schema }) and reads result.output. System prompts use `instructions` (the `system` option is deprecated).
- maxRetries: 0 on every AI call. The SDK default retries twice inside one call, which would break the 12 s per-attempt budget (R10). Fallback to the other provider is the only retry.
- Time budget: AI_ATTEMPT_TIMEOUT_MS = 12000 via AbortSignal.timeout(); at most 2 attempts, so 24 s worst case inside the 60 s route limit.
- Speed settings: Gemini 3.x gets thinkingLevel "low"; Groq gpt-oss models get reasoningEffort "low". Groq uses structuredOutputs: true (JSON schema mode), which the installed @ai-sdk/groq supports and enables by default.
- AnalysisSchema is tolerant on sizes (no max lengths, sub-scores as numbers); normalizeAnalysis() trims lists to 6/5 items and clamps sub-scores to integers 0-25. This avoids burning the fallback on a 7th bullet while structural errors still fail validation and fall back.
- Score and tier are computed in code from the four sub-scores, never by the model.
- Contact privacy (R11): prompts are built only through toAIView(), which has no contact field.
- Model ids are required env vars; a missing one counts as a failed attempt, so the other provider still runs.
- Checked Next.js 16.3: route params are a Promise (awaited in readId()); malformed ids return 404 before touching the database. `npx next build` passes with all 5 routes dynamic.
- Chat fallback lives in streamChatWithFallback() (providers.ts), not a try/catch around streamText: it reads each model's fullStream part by part. Error/timeout before the first token -> next model; error after text started -> text-end + error chunk, no provider switch. First-token timeout 12 s. Tested with mock models: OK, 429 inside stream, bad key, mid-stream error, both fail, 12 s timeout.
- Chat writes UIMessageChunks itself through createUIMessageStream, so useChat (@ai-sdk/react) can consume it. History comes from the database (last 20), never from the client; the route reads only the last user message from useChat's body (or { text } for api.http).
- Re-analysis is claimed with one conditional UPDATE (status != pending OR updated_at older than 90 s), so two clicks cannot start two analyses.
- POST /api/leads returns 200 with status "failed" (not 502) when both AI providers fail, so the lead is never lost and the UI shows Retry.
- Usage cap counts leads created in the last rolling hour across the app (rule R12).
- UI: tier colours (hot #C8233C, warm #D98A00, cold #4A6A8A) are the only strong colours; navy #14213D for text and primary buttons. Every colour also has a text label.
- The header's New lead button lives in the server layout, so the dialog announces a new lead with a window event (LEAD_CREATED_EVENT) instead of shared state; the dashboard listens, upserts and highlights it.
- Timeline uses a native <select> (works well on phones and avoids depending on the shadcn Select API).
- Cards use a stretched link so the whole card opens the lead while the Retry button stays clickable.

## 4. Known issues
- Model ids must be verified on the provider dashboards before use. The installed @ai-sdk/google already lists gemini-3.7-flash and gemini-3.8-flash; check which one your free key can call and set GEMINI_MODEL accordingly.
- Live Gemini/Groq/Supabase calls are verified by the manual api.http steps (cannot be tested without your keys).

NEXT: Prompt 2.2 - Lead detail: AI brief + grounded chat
