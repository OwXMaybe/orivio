-- Phase 5: store whole investigations transactionally, list them, and share reports by link.
-- All functions run with the caller's privileges (security invoker) unless stated, so RLS applies.

-- Order matters: reference numbers [1], [2] … follow source order.
alter table sources add column position smallint not null default 0;
alter table research_queries add column position smallint not null default 0;
alter table evidence add column position smallint not null default 0;

-- Share tokens must be long and random; enforced in the database, not only in the app.
alter table investigations add constraint share_token_strength
  check (share_token is null or (char_length(share_token) >= 32 and share_token ~ '^[A-Za-z0-9_-]+$'));
alter table investigations add constraint share_token_matches_visibility
  check ((visibility = 'link') = (share_token is not null));

alter table user_notes add constraint user_notes_body_not_blank check (char_length(btrim(body)) > 0);

-- ───────────────────────── Document builder (one investigation → the app's JSON shape)
create or replace function investigation_document(i investigations) returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'id', i.id,
    'input', i.input,
    'inputUrl', i.input_url,
    'researchLanguage', i.research_language,
    'createdAt', i.created_at,
    'updatedAt', i.updated_at,
    'status', i.status,
    'mode', jsonb_build_object('ai', i.ai_mode, 'search', i.search_mode),
    'claims', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'text', c.text, 'context', c.context, 'kind', c.kind, 'category', c.category,
        'verifiable', c.verifiable, 'verifiabilityReason', c.verifiability_reason, 'highImpact', c.high_impact
      ) order by c.position) from claims c where c.investigation_id = i.id), '[]'::jsonb),
    'queries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id, 'claimId', q.claim_id, 'question', q.question, 'query', q.query, 'stance', q.stance, 'round', q.round
      ) order by q.position) from research_queries q where q.investigation_id = i.id), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'url', s.url, 'title', s.title, 'publisher', s.publisher, 'author', s.author,
        'publishedAt', s.published_at, 'accessedAt', s.accessed_at, 'type', s.type, 'primary', s.is_primary,
        'snippet', s.snippet, 'provider', s.provider, 'queryIds', to_jsonb(s.query_ids), 'retrieval', s.retrieval,
        'retrievalError', s.retrieval_error, 'excerpt', s.excerpt, 'independenceGroup', s.independence_group,
        'evaluationNotes', s.evaluation_notes
      ) order by s.position) from sources s where s.investigation_id = i.id), '[]'::jsonb),
    'evidence', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'claimId', e.claim_id, 'sourceId', e.source_id, 'quote', e.quote, 'relation', e.relation,
        'explanation', e.explanation, 'limitations', e.limitations, 'round', e.round
      ) order by e.position) from evidence e where e.investigation_id = i.id), '[]'::jsonb),
    'contradictions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'claimId', ca.claim_id, 'factors', to_jsonb(ca.factors), 'explanation', ca.explanation,
        'supportingEvidenceIds', to_jsonb(ca.supporting_evidence_ids), 'contradictingEvidenceIds', to_jsonb(ca.contradicting_evidence_ids)
      ) order by ca.created_at) from contradiction_analyses ca where ca.investigation_id = i.id), '[]'::jsonb),
    'rounds', i.rounds,
    'verdicts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'claimId', v.claim_id, 'value', v.value, 'confidence', v.confidence, 'confidenceFactors', v.confidence_factors,
        'explanation', v.explanation, 'adjustedFrom', v.adjusted_from, 'rule', v.rule, 'assessedAt', v.created_at
      ) order by c.position) from verdicts v join claims c on c.id = v.claim_id where v.investigation_id = i.id), '[]'::jsonb),
    'revisions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'revision', r.revision, 'createdAt', r.created_at, 'previousVerdicts', r.previous_verdicts,
        'newVerdicts', r.new_verdicts, 'newSourceIds', to_jsonb(r.new_source_ids),
        'newEvidenceIds', to_jsonb(r.new_evidence_ids), 'changed', r.changed
      ) order by r.revision) from report_revisions r where r.investigation_id = i.id), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('stage', ev.stage, 'status', ev.status, 'detail', ev.detail, 'at', ev.at) order by ev.id)
      from investigation_events ev where ev.investigation_id = i.id), '[]'::jsonb),
    'limitations', to_jsonb(i.limitations),
    'primaryCategory', i.primary_category,
    'favorite', i.favorite
  );
$$;

-- ───────────────────────── Save (insert or replace) in one transaction
create or replace function save_investigation(doc jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  uid uuid := auth.uid();
  inv_id uuid := (doc->>'id')::uuid;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if jsonb_array_length(coalesce(doc->'claims', '[]')) > 10
     or jsonb_array_length(coalesce(doc->'sources', '[]')) > 150
     or jsonb_array_length(coalesce(doc->'evidence', '[]')) > 500
     or jsonb_array_length(coalesce(doc->'queries', '[]')) > 100
     or jsonb_array_length(coalesce(doc->'events', '[]')) > 100 then
    raise exception 'document_too_large' using errcode = '22023';
  end if;

  -- Another user's id cannot be taken over: the UPDATE branch is subject to RLS and fails.
  insert into investigations as t (
    id, user_id, input, input_url, research_language, status, primary_category, ai_mode, search_mode,
    limitations, favorite, rounds, created_at, updated_at
  ) values (
    inv_id, uid, doc->>'input', doc->>'inputUrl', doc->>'researchLanguage',
    (doc->>'status')::investigation_status, (doc->>'primaryCategory')::claim_category,
    doc->'mode'->>'ai', doc->'mode'->>'search',
    coalesce(array(select jsonb_array_elements_text(doc->'limitations')), '{}'),
    coalesce((doc->>'favorite')::boolean, false), coalesce((doc->>'rounds')::smallint, 0),
    coalesce((doc->>'createdAt')::timestamptz, now()), coalesce((doc->>'updatedAt')::timestamptz, now())
  )
  on conflict (id) do update set
    input = excluded.input, input_url = excluded.input_url, research_language = excluded.research_language,
    status = excluded.status, primary_category = excluded.primary_category, ai_mode = excluded.ai_mode,
    search_mode = excluded.search_mode, limitations = excluded.limitations, favorite = excluded.favorite,
    rounds = excluded.rounds, updated_at = excluded.updated_at
  where t.user_id = uid;
  if not found then raise exception 'not_owner' using errcode = '42501'; end if;

  -- Replace the research record (revisions are append-only and handled below).
  delete from claims where investigation_id = inv_id;        -- cascades to queries, evidence, verdicts, analyses
  delete from sources where investigation_id = inv_id;
  delete from investigation_events where investigation_id = inv_id;

  insert into claims (id, investigation_id, position, text, context, kind, category, verifiable, verifiability_reason, high_impact)
  select (c->>'id')::uuid, inv_id, pos, c->>'text', coalesce(c->>'context', ''), (c->>'kind')::claim_kind,
         (c->>'category')::claim_category, (c->>'verifiable')::boolean, coalesce(c->>'verifiabilityReason', ''),
         coalesce((c->>'highImpact')::boolean, false)
  from jsonb_array_elements(coalesce(doc->'claims', '[]')) with ordinality as x(c, pos);

  insert into research_queries (id, investigation_id, claim_id, position, question, query, stance, round)
  select (q->>'id')::uuid, inv_id, (q->>'claimId')::uuid, pos, q->>'question', q->>'query',
         (q->>'stance')::research_stance, (q->>'round')::smallint
  from jsonb_array_elements(coalesce(doc->'queries', '[]')) with ordinality as x(q, pos);

  insert into sources (id, investigation_id, position, url, title, publisher, author, published_at, accessed_at, type,
                       is_primary, snippet, provider, query_ids, retrieval, retrieval_error, excerpt,
                       independence_group, evaluation_notes)
  select (s->>'id')::uuid, inv_id, pos, s->>'url', s->>'title', s->>'publisher', s->>'author', s->>'publishedAt',
         (s->>'accessedAt')::timestamptz, (s->>'type')::source_type, (s->>'primary')::boolean,
         coalesce(s->>'snippet', ''), s->>'provider',
         coalesce(array(select jsonb_array_elements_text(s->'queryIds'))::uuid[], '{}'),
         (s->>'retrieval')::retrieval_status, s->>'retrievalError', s->>'excerpt',
         s->>'independenceGroup', s->>'evaluationNotes'
  from jsonb_array_elements(coalesce(doc->'sources', '[]')) with ordinality as x(s, pos);

  insert into evidence (id, investigation_id, claim_id, source_id, position, quote, relation, explanation, limitations, round)
  select (e->>'id')::uuid, inv_id, (e->>'claimId')::uuid, (e->>'sourceId')::uuid, pos, e->>'quote',
         (e->>'relation')::evidence_relation, e->>'explanation', coalesce(e->>'limitations', ''), (e->>'round')::smallint
  from jsonb_array_elements(coalesce(doc->'evidence', '[]')) with ordinality as x(e, pos);

  insert into contradiction_analyses (investigation_id, claim_id, factors, explanation, supporting_evidence_ids, contradicting_evidence_ids)
  select inv_id, (a->>'claimId')::uuid,
         array(select jsonb_array_elements_text(a->'factors'))::contradiction_factor[], a->>'explanation',
         coalesce(array(select jsonb_array_elements_text(a->'supportingEvidenceIds'))::uuid[], '{}'),
         coalesce(array(select jsonb_array_elements_text(a->'contradictingEvidenceIds'))::uuid[], '{}')
  from jsonb_array_elements(coalesce(doc->'contradictions', '[]')) as x(a);

  insert into verdicts (investigation_id, claim_id, value, confidence, confidence_factors, explanation, adjusted_from, rule, created_at)
  select inv_id, (v->>'claimId')::uuid, (v->>'value')::verdict_value, (v->>'confidence')::evidence_confidence,
         coalesce(v->'confidenceFactors', '[]'), coalesce(v->>'explanation', ''), (v->>'adjustedFrom')::verdict_value,
         (v->>'rule')::verdict_rule, coalesce((v->>'assessedAt')::timestamptz, now())
  from jsonb_array_elements(coalesce(doc->'verdicts', '[]')) as x(v);

  insert into investigation_events (investigation_id, stage, status, detail, at)
  select inv_id, (ev->>'stage')::stage_id, (ev->>'status')::stage_status, coalesce(ev->>'detail', ''), (ev->>'at')::timestamptz
  from jsonb_array_elements(coalesce(doc->'events', '[]')) with ordinality as x(ev, pos)
  order by pos;

  -- Correction history: only new revision numbers are added; existing ones are never changed.
  insert into report_revisions (investigation_id, revision, previous_verdicts, new_verdicts, new_source_ids, new_evidence_ids, changed, created_at)
  select inv_id, (r->>'revision')::smallint, r->'previousVerdicts', r->'newVerdicts',
         coalesce(array(select jsonb_array_elements_text(r->'newSourceIds'))::uuid[], '{}'),
         coalesce(array(select jsonb_array_elements_text(r->'newEvidenceIds'))::uuid[], '{}'),
         coalesce((r->>'changed')::boolean, false), (r->>'createdAt')::timestamptz
  from jsonb_array_elements(coalesce(doc->'revisions', '[]')) as x(r)
  on conflict (investigation_id, revision) do nothing;

  return inv_id;
end;
$$;

-- ───────────────────────── The signed-in user's investigations, newest first (owner sees share state)
create or replace function list_my_investigations() returns jsonb
language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(doc order by created_at desc), '[]'::jsonb)
  from (
    select investigation_document(i) || jsonb_build_object('shareToken', i.share_token) as doc, i.created_at
    from investigations i
    where i.user_id = auth.uid()
    order by i.created_at desc
    limit 500
  ) mine;
$$;

-- ───────────────────────── Public, read-only view of a shared report
-- Security definer so anonymous visitors can read exactly one report by its token;
-- owner id, share token and notes are never included.
create or replace function get_shared_report(token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select investigation_document(i)
  from investigations i
  where i.visibility = 'link' and i.share_token = token and char_length(token) >= 32;
$$;

revoke all on function save_investigation(jsonb) from public, anon;
revoke all on function list_my_investigations() from public, anon;
revoke all on function investigation_document(investigations) from public, anon;
grant execute on function save_investigation(jsonb) to authenticated;
grant execute on function list_my_investigations() to authenticated;
grant execute on function investigation_document(investigations) to authenticated;
revoke all on function get_shared_report(text) from public;
grant execute on function get_shared_report(text) to anon, authenticated;

-- Keep notes' updated_at honest.
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger user_notes_touch before update on user_notes for each row execute function touch_updated_at();
