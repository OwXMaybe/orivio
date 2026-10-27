# ORIVIO — Discover What's True

An evidence-led research laboratory: it splits claims into checkable statements, plans balanced research, gathers sources from both sides, and reports transparently on what it did and did not do.

## Run locally

```bash
npm install
cp .env.example .env.local   # optional: add provider keys
npm run dev                  # http://localhost:3000
```

```bash
npm run check     # typecheck + lint + all tests + production build (what CI runs)
npm test          # tests only
```

Test suites (`tests/`): research engine, evidence and verdict rules, citation accuracy, API routes (integration), security hardening (CSP, request guards, prompt-injection fencing, XSS rendering), the investigation store, and the database (`tests/db`: migrations, RLS, sharing, notes, collections on embedded PostgreSQL).

Without any keys the engine runs in **rule-based mode**: it splits sentences, builds a template research plan, and clearly reports that no AI provider and no search provider were used. It never fabricates sources or verdicts.

## Status by phase

| Phase | State |
|---|---|
| 1 Foundation | Design system (dark/light tokens), sidebar shell, responsive layout, dashboard, TR/EN i18n, Supabase schema + RLS |
| 2 Research engine | Claim extraction, classification, balanced research planning, Brave + Google Fact Check adapters, SSRF-safe page retrieval, streamed real-progress timeline |
| 3 Evidence intelligence | Evidence extraction with automatic quote verification, primary/secondary evaluation, duplicate-text independence grouping, supporting/contradicting/context classification, contradiction analysis, one bounded additional research round. Requires an AI provider; without one the stage is reported as *skipped* |
| 4 Reporting | Verdict engine (AI proposal + fixed evidence guardrails + citation checks), rule-based evidence confidence kept separate from the verdict, per-claim Final Assessment, clickable citations, Evidence Map, and a correction history with re-check (previous verdicts preserved in each revision) |
| 5 UX | Supabase Auth (email + password), investigations stored in the account (or in the browser when signed out), import of local investigations, notes, collections, share-by-link with a public read-only page, history/search/filters/favorites, Source Library, Statistics, print-to-PDF |
| 6 Release | Installable PWA (service worker, offline page, icons), nonce-based CSP and security headers, API request guards, error boundaries, test suites listed above, CI workflow, version 0.9.0 (see `CHANGELOG.md`) |

## Accounts with Supabase

Without Supabase the app works fully in the browser (signed out). To enable accounts:

1. Create a project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, run the files in `supabase/migrations` in order (`0001` … `0004`), or use `supabase db push` with the Supabase CLI.
3. In **Project Settings → API**, copy the project URL and the `anon` public key into `.env.local` as `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The `service_role` key is not used by the app — do not put it in a `NEXT_PUBLIC_` variable.
4. In **Authentication → URL Configuration**, set the Site URL (e.g. `http://localhost:3000`) and add `http://localhost:3000/login` as a redirect URL for email confirmation.
5. Restart `npm run dev`. Sign up at `/login`; existing browser investigations can be copied to the account from **Settings → Account**.

How data is protected:

- Every table has Row Level Security; users can only read and change their own rows.
- Investigations are saved through `save_investigation()` in one transaction, under the caller's own permissions.
- Correction-history revisions are insert-only — not even the owner can edit or delete them (they are removed only with the whole investigation).
- A shared report is readable only through `get_shared_report(token)` with a 256-bit random token; the owner, the token itself and notes are never included. The share page is `noindex` and sends no referrer.

The SQL and its policies are tested against a real PostgreSQL (PGlite) in `tests/db`, including cross-user access attempts.

## Configuration (`.env.local`)

| Variable | Purpose |
|---|---|
| `AI_PROVIDER` | `anthropic` (default) or `openai-compatible` |
| `AI_API_KEY`, `AI_MODEL`, `AI_API_BASE_URL` | AI adapter (model defaults to `claude-opus-5-5` for Anthropic) |
| `SEARCH_API_KEY` | Brave Search API |
| `GOOGLE_FACT_CHECK_API_KEY` | Google Fact Check Tools API |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase (schema in `supabase/migrations`) |
| `ORIVIO_DEMO_MODE=true` | Ignore all provider keys |

Secrets are read only in `lib/config/env.ts` on the server. `/api/status` exposes provider *names* only.

## Structure

```text
app/                 pages (dashboard, investigate, explore, investigations, sources, statistics, settings, help) + api/
components/          layout/, investigation/, reports/, sources/, ui/
lib/ai/              provider-independent AI adapter (Anthropic SDK, OpenAI-compatible)
lib/search/          search provider adapter (Brave)
lib/fact-check/      Google Fact Check Tools adapter
lib/research/        engine stages: extract, classify, plan, discover, retrieve, evidence, independence, contradiction, confidence, verdict, engine (+ re-check)
lib/security/        SSRF-safe fetch, IP ranges, HTML→text, rate limit
lib/database/        Supabase client, browser-local store
lib/i18n/            TR/EN dictionaries, preferences
types/               investigation, claim, source, evidence, verdict
supabase/migrations  schema + Row Level Security
tests/               vitest suites
```

## Security notes

- URL inputs and source pages go through `safeFetch`: http(s) only, no credentials, ports 80/443, internal hostnames rejected, DNS answers checked at connect time (blocks rebinding), every redirect re-validated, size and time limits.
- Page text is never rendered as HTML and is fenced as untrusted when sent to the AI, with an explicit instruction not to follow it.
- Input is validated with Zod; API routes accept only same-origin JSON within a size limit and are rate-limited per client.
- Every page gets a fresh CSP nonce (`middleware.ts`); scripts without it do not run. Frames, plugins and foreign connections are blocked; HSTS is sent in production.
- Supabase: RLS on every table; child tables inherit access from their investigation; shared reports only via a `security definer` function keyed by an unguessable token; report revisions are append-only.
- The service worker never caches API responses, shared reports or the login page.

## Deploying

The app is a standard Next.js 15 project (Node.js runtime for the API routes). On Vercel or any Node host:

1. Set the environment variables from `.env.example` in the host's settings (never commit `.env.local`).
2. Apply the Supabase migrations to the production project and set its Site URL / redirect URL to the production domain.
3. Deploy, then open `/settings` to confirm which providers are active.

Before a public release:

- [ ] Live test with real AI, search and Supabase credentials (one Turkish, one English, one article URL, one re-check, one share link).
- [ ] The rate limiter is in-memory per server instance. With several instances or serverless scaling, move it to a shared store (e.g. a Postgres table or Redis).
- [ ] Review Supabase Auth settings: email confirmation on, password minimum length ≥ 8, rate limits.
- [ ] Set `maxDuration` limits that your host plan allows (the investigate routes request up to 300 s).
