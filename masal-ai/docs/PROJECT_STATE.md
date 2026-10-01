# LeadLens - Project State

## 1. Status
| Step | Description | Status |
|------|-------------|--------|
| 1.1 | Contracts, database and AI layer | Done |
| 1.2 | API routes | Not started |
| 2.1 | Dashboard, intake form, ranked list | Not started |
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
| src/lib/ai/providers.ts | AI_ATTEMPT_TIMEOUT_MS, getPrimaryModel(), getFallbackModel(), getChatModels(), runWithFallback(), AIUnavailableError |
| src/lib/ai/analyze.ts | analyzeLead(input) -> { analysis, score, tier, urgent, provider } |
| src/lib/supabase/server.ts | getServerSupabase(): service-role client, server only |
| src/lib/supabase/browser.ts | getBrowserSupabase(): anon client for Realtime only |

## 3. Decisions
- Installed versions checked (rule R5): ai 7.x, @ai-sdk/google 4.x, @ai-sdk/groq 4.x, zod 4.x, @supabase/supabase-js 2.x. In ai 7, generateObject is deprecated, so analysis uses generateText with output: Output.object({ schema }) and reads result.output. System prompts use `instructions` (the `system` option is deprecated).
- maxRetries: 0 on every AI call. The SDK default retries twice inside one call, which would break the 12 s per-attempt budget (R10). Fallback to the other provider is the only retry.
- Time budget: AI_ATTEMPT_TIMEOUT_MS = 12000 via AbortSignal.timeout(); at most 2 attempts, so 24 s worst case inside the 60 s route limit.
- Speed settings: Gemini 3.x gets thinkingLevel "low"; Groq gpt-oss models get reasoningEffort "low". Groq uses structuredOutputs: true (JSON schema mode), which the installed @ai-sdk/groq supports and enables by default.
- AnalysisSchema is tolerant on sizes (no max lengths, sub-scores as numbers); normalizeAnalysis() trims lists to 6/5 items and clamps sub-scores to integers 0-25. This avoids burning the fallback on a 7th bullet while structural errors still fail validation and fall back.
- Score and tier are computed in code from the four sub-scores, never by the model.
- Contact privacy (R11): prompts are built only through toAIView(), which has no contact field.
- Model ids are required env vars; a missing one counts as a failed attempt, so the other provider still runs.

## 4. Known issues
- Model ids must be verified on the provider dashboards before use. The installed @ai-sdk/google already lists gemini-3.7-flash and gemini-3.8-flash; check which one your free key can call and set GEMINI_MODEL accordingly.
- Not yet tested against live providers (needs keys in .env.local; covered in 1.2 verify steps).

NEXT: Prompt 1.2 - API routes
