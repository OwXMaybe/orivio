-- ORIVIO initial schema. All user data is private by default and protected by RLS.
-- gen_random_uuid() is built into PostgreSQL 13+, so no extension is needed.

-- ───────────────────────── Enums
create type claim_category as enum ('science','technology','health','politics','economy','history','environment','education','other');
create type claim_kind as enum ('factual','opinion','prediction','question');
create type research_stance as enum ('supporting','contradicting','context');
create type source_type as enum ('academic','government','news','research_organization','fact_checker','other');
create type retrieval_status as enum ('not_attempted','retrieved','failed','blocked');
create type evidence_relation as enum ('supports','contradicts','provides_context','challenges_methodology');
create type verdict_value as enum ('true','mostly_true','misleading','mostly_false','false','insufficient_evidence','unverifiable');
create type evidence_confidence as enum ('high','medium','low');
create type investigation_status as enum ('running','partial','completed','failed');
create type stage_id as enum ('claim_received','claims_extracted','research_plan_created','sources_discovered','evidence_analyzed','sources_compared','report_generated');
create type stage_status as enum ('running','completed','skipped','failed');
create type visibility as enum ('private','link');

-- ───────────────────────── Profiles
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  interface_language text not null default 'en' check (interface_language in ('tr','en')),
  research_language text not null default 'en' check (research_language in ('tr','en')),
  theme text not null default 'dark' check (theme in ('dark','light','system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ───────────────────────── Investigations
create table investigations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  input text not null check (char_length(input) between 8 and 4000),
  input_url text,
  research_language text not null check (research_language in ('tr','en')),
  status investigation_status not null default 'running',
  primary_category claim_category not null default 'other',
  ai_mode text not null,
  search_mode text,
  limitations text[] not null default '{}',
  favorite boolean not null default false,
  visibility visibility not null default 'private',
  -- Unguessable token used only for "anyone with the link" sharing.
  share_token text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index investigations_user_created_idx on investigations (user_id, created_at desc);

create table claims (
  id uuid primary key default gen_random_uuid(),
  investigation_id uuid not null references investigations(id) on delete cascade,
  position smallint not null,
  text text not null,
  context text not null default '',
  kind claim_kind not null,
  category claim_category not null,
  verifiable boolean not null,
  verifiability_reason text not null,
  high_impact boolean not null default false
);
create index claims_investigation_idx on claims (investigation_id);

create table research_queries (
  id uuid primary key default gen_random_uuid(),
  investigation_id uuid not null references investigations(id) on delete cascade,
  claim_id uuid not null references claims(id) on delete cascade,
  question text not null,
  query text not null,
  stance research_stance not null,
  round smallint not null default 1 check (round between 1 and 5)
);
create index research_queries_investigation_idx on research_queries (investigation_id);

create table sources (
  id uuid primary key default gen_random_uuid(),
  investigation_id uuid not null references investigations(id) on delete cascade,
  url text not null,
  title text not null,
  publisher text not null,
  author text,
  published_at text,          -- as reported by the source; never inferred
  accessed_at timestamptz not null,
  type source_type not null,
  is_primary boolean,         -- null until evaluated
  snippet text not null default '',
  provider text not null,
  query_ids uuid[] not null default '{}',
  retrieval retrieval_status not null,
  retrieval_error text,
  excerpt text,
  -- Sources that copy the same original (e.g. one press release) share a group.
  independence_group text
);
create index sources_investigation_idx on sources (investigation_id);

create table evidence (
  id uuid primary key default gen_random_uuid(),
  investigation_id uuid not null references investigations(id) on delete cascade,
  claim_id uuid not null references claims(id) on delete cascade,
  source_id uuid not null references sources(id) on delete cascade,
  quote text not null,
  relation evidence_relation not null,
  explanation text not null,
  limitations text not null default ''
);
create index evidence_investigation_idx on evidence (investigation_id);

create table verdicts (
  id uuid primary key default gen_random_uuid(),
  investigation_id uuid not null references investigations(id) on delete cascade,
  claim_id uuid not null references claims(id) on delete cascade,
  value verdict_value not null,
  confidence evidence_confidence not null,
  explanation text not null,
  created_at timestamptz not null default now(),
  unique (claim_id)
);

create table investigation_events (
  id bigint generated always as identity primary key,
  investigation_id uuid not null references investigations(id) on delete cascade,
  stage stage_id not null,
  status stage_status not null,
  detail text not null default '',
  at timestamptz not null default now()
);
create index investigation_events_investigation_idx on investigation_events (investigation_id, at);

-- Correction history: every superseded assessment is kept, with the reason it changed.
create table report_revisions (
  id uuid primary key default gen_random_uuid(),
  investigation_id uuid not null references investigations(id) on delete cascade,
  revision smallint not null,
  previous_verdicts jsonb not null,
  new_evidence_ids uuid[] not null default '{}',
  change_reason text not null,
  created_at timestamptz not null default now(),
  unique (investigation_id, revision)
);

create table collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);
create table collection_items (
  collection_id uuid not null references collections(id) on delete cascade,
  investigation_id uuid not null references investigations(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (collection_id, investigation_id)
);

create table user_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  investigation_id uuid not null references investigations(id) on delete cascade,
  body text not null check (char_length(body) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ───────────────────────── Row Level Security
alter table profiles enable row level security;
alter table investigations enable row level security;
alter table claims enable row level security;
alter table research_queries enable row level security;
alter table sources enable row level security;
alter table evidence enable row level security;
alter table verdicts enable row level security;
alter table investigation_events enable row level security;
alter table report_revisions enable row level security;
alter table collections enable row level security;
alter table collection_items enable row level security;
alter table user_notes enable row level security;

create policy "own profile" on profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "own investigations" on investigations for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own collections" on collections for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own notes" on user_notes for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from investigations i where i.id = investigation_id and i.user_id = auth.uid()));
create policy "own collection items" on collection_items for all
  using (exists (select 1 from collections c where c.id = collection_id and c.user_id = auth.uid()))
  with check (
    exists (select 1 from collections c where c.id = collection_id and c.user_id = auth.uid())
    and exists (select 1 from investigations i where i.id = investigation_id and i.user_id = auth.uid())
  );

-- Child tables inherit access from their investigation.
create or replace function owns_investigation(inv uuid) returns boolean
language sql stable security invoker set search_path = public as $$
  select exists (select 1 from investigations i where i.id = inv and i.user_id = auth.uid());
$$;

create policy "via investigation" on claims for all using (owns_investigation(investigation_id)) with check (owns_investigation(investigation_id));
create policy "via investigation" on research_queries for all using (owns_investigation(investigation_id)) with check (owns_investigation(investigation_id));
create policy "via investigation" on sources for all using (owns_investigation(investigation_id)) with check (owns_investigation(investigation_id));
create policy "via investigation" on evidence for all using (owns_investigation(investigation_id)) with check (owns_investigation(investigation_id));
create policy "via investigation" on verdicts for all using (owns_investigation(investigation_id)) with check (owns_investigation(investigation_id));
create policy "via investigation" on investigation_events for all using (owns_investigation(investigation_id)) with check (owns_investigation(investigation_id));
-- Revisions are append-only for owners: no update/delete policy, so history cannot be rewritten.
create policy "read revisions" on report_revisions for select using (owns_investigation(investigation_id));
create policy "append revisions" on report_revisions for insert with check (owns_investigation(investigation_id));

-- Shared reports are read through this function only, never via an open select policy.
create or replace function get_shared_report(token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'investigation', to_jsonb(i) - 'user_id' - 'share_token',
    'claims', (select coalesce(jsonb_agg(c order by c.position), '[]') from claims c where c.investigation_id = i.id),
    'sources', (select coalesce(jsonb_agg(s), '[]') from sources s where s.investigation_id = i.id),
    'evidence', (select coalesce(jsonb_agg(e), '[]') from evidence e where e.investigation_id = i.id),
    'verdicts', (select coalesce(jsonb_agg(v), '[]') from verdicts v where v.investigation_id = i.id),
    'revisions', (select coalesce(jsonb_agg(r order by r.revision), '[]') from report_revisions r where r.investigation_id = i.id)
  )
  from investigations i
  where i.share_token = token and i.visibility = 'link' and char_length(token) >= 32;
$$;
revoke all on function get_shared_report(text) from public;
grant execute on function get_shared_report(text) to anon, authenticated;

-- Create a profile row automatically on sign-up.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();
