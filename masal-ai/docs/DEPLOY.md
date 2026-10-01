# Deploying Masal AI to Vercel (free Hobby plan)

## Before you start
- `npm run build` and `npm run lint` pass locally.
- Everything is committed and pushed to the public GitHub repo.
- `supabase/schema.sql` has been run in your Supabase project (tables `leads` and `lead_messages` exist).
- `.env.local` is NOT in the repo (`git ls-files | grep env` shows only `.env.example`).

## Steps
1. Go to vercel.com and sign in with GitHub.
2. Click **Add New...**, then **Project**.
3. Find your repo in the list and click **Import**.
4. **Root Directory:** click **Edit** and choose the `masal-ai` folder. The repo root (`MASAL-AI`) only holds the LICENSE; the app lives one folder down. This is the most common mistake.
5. **Framework Preset:** Vercel detects **Next.js**. Leave the build and output settings as they are.
6. Open **Environment Variables** and add each name from the table below. Paste values exactly, without quotes. Keep all three environments (Production, Preview, Development) ticked.
7. Click **Deploy** and wait about a minute.
8. Open the URL Vercel shows (for example `https://masal-ai.vercel.app`) and run the smoke test below.

## Environment variables (names only, never commit values)

| Name | Required | Value / note |
|------|----------|--------------|
| NEXT_PUBLIC_SUPABASE_URL | Yes | Supabase project URL |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Yes | Supabase publishable / anon key |
| SUPABASE_SERVICE_ROLE_KEY | Yes | Supabase secret / service_role key. Server only. |
| GOOGLE_GENERATIVE_AI_API_KEY | Yes | Google AI Studio key |
| GEMINI_MODEL | Yes | Same value as in .env.local, e.g. gemini-3.6-flash |
| GROQ_API_KEY | Yes | Groq key |
| GROQ_MODEL | Yes | Same value as in .env.local, e.g. openai/gpt-oss-120b |
| MAX_LEADS_PER_HOUR | Optional | Default 60. New leads allowed per rolling hour, app-wide. |
| FORCE_FALLBACK | Optional | Only for a fallback demo: "true" makes every call use Groq. Remove afterwards. |
| ENABLE_DELETE | **Do not set in production** | Leave it out so reviewers cannot delete your leads. Use it only locally. |

Any time you change an environment variable in Vercel, redeploy (Deployments, the three dots on the latest one, **Redeploy**). Every `git push` to `main` redeploys automatically.

## Production smoke test (about 5 minutes)
1. Open the live URL in a private/incognito window. The dashboard loads.
2. Add a lead: it analyses, scores and appears in the right tier.
3. Open it, ask the coach a question, reload: the chat history is still there.
4. Open the site in two tabs and add a lead in one: it appears in the other without a refresh.
5. Click **Load sample leads** and let all six finish.
6. Open a lead: there is **no Delete button** (ENABLE_DELETE is not set).
7. Visit `/leads/abc`: "Lead not found".
8. Optional fallback demo: set `FORCE_FALLBACK=true`, redeploy, add a lead, see "Analysed by Groq (fallback)". Remove the variable and redeploy.

## If something only fails in production
- Almost always a wrong environment variable name or a missing redeploy. Compare the names in Vercel with this table letter by letter.
- Vercel, your project, **Logs**: server errors (including `[ai]` and `[api]` lines) show up there.
- 404 on every page or "No Next.js version detected": the Root Directory is not set to `masal-ai`.

## Keep the demo alive
- Free Supabase projects pause after about a week without activity. Open the live app and add a lead shortly before any review or interview. If it is paused, resume it from the Supabase dashboard.
- Before recording the demo, load the sample leads so the dashboard is never empty.
