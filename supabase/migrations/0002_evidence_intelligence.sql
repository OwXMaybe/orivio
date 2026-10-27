-- Phase 3: source evaluation notes, research round per evidence, contradiction analyses.

alter table sources add column evaluation_notes text;
alter table evidence add column round smallint not null default 1 check (round between 1 and 5);
alter table investigations add column rounds smallint not null default 1 check (rounds between 0 and 5);

create type contradiction_factor as enum (
  'different_dates','different_methods','different_definitions','out_of_context',
  'newer_research','different_populations','source_quality','other'
);

create table contradiction_analyses (
  id uuid primary key default gen_random_uuid(),
  investigation_id uuid not null references investigations(id) on delete cascade,
  claim_id uuid not null references claims(id) on delete cascade,
  factors contradiction_factor[] not null check (cardinality(factors) between 1 and 4),
  explanation text not null,
  supporting_evidence_ids uuid[] not null default '{}',
  contradicting_evidence_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (claim_id)
);
create index contradiction_analyses_investigation_idx on contradiction_analyses (investigation_id);

alter table contradiction_analyses enable row level security;
create policy "via investigation" on contradiction_analyses for all
  using (owns_investigation(investigation_id)) with check (owns_investigation(investigation_id));

-- Include contradiction analyses in shared reports.
create or replace function get_shared_report(token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'investigation', to_jsonb(i) - 'user_id' - 'share_token',
    'claims', (select coalesce(jsonb_agg(c order by c.position), '[]') from claims c where c.investigation_id = i.id),
    'sources', (select coalesce(jsonb_agg(s), '[]') from sources s where s.investigation_id = i.id),
    'evidence', (select coalesce(jsonb_agg(e), '[]') from evidence e where e.investigation_id = i.id),
    'contradictions', (select coalesce(jsonb_agg(ca), '[]') from contradiction_analyses ca where ca.investigation_id = i.id),
    'verdicts', (select coalesce(jsonb_agg(v), '[]') from verdicts v where v.investigation_id = i.id),
    'revisions', (select coalesce(jsonb_agg(r order by r.revision), '[]') from report_revisions r where r.investigation_id = i.id)
  )
  from investigations i
  where i.share_token = token and i.visibility = 'link' and char_length(token) >= 32;
$$;
