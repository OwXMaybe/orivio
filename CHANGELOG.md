# Changelog

## 0.9.0 — release candidate

First feature-complete version. Not yet tested end-to-end with live AI, search and Supabase credentials.

### Research engine
- Claim extraction and classification (AI, with a rule-based fallback that never invents text).
- Balanced research plans, Brave Search and Google Fact Check adapters, SSRF-safe page retrieval.
- Evidence extraction with automatic verbatim quote verification; source evaluation; independence grouping of copied texts.
- Contradiction analysis, one bounded additional research round.
- Verdicts proposed by the AI and checked by fixed evidence rules and citation checks; rule-based evidence confidence kept separate from the verdict.
- Re-check with correction history; earlier verdicts are preserved in each revision.

### Product
- Dashboard, Investigate (live timeline), Explore, My Investigations, Source Library, Statistics, Settings, Help.
- Turkish/English interface, dark/light theme, responsive layout.
- Supabase accounts, investigations stored per account, import from the browser, notes, collections, share-by-link.
- Installable PWA with an offline page.

### Security
- Nonce-based Content Security Policy, frame and content-type protections, HSTS in production.
- Same-origin, content-type, size and rate limits on API routes.
- Row Level Security on every table, append-only revisions, token-based sharing without exposing the owner.

### Quality
- Unit, integration, database (PGlite), security and citation-accuracy test suites; CI workflow.
