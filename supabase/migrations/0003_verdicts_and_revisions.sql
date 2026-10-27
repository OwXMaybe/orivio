-- Phase 4: verdict details, evidence confidence basis, and structured correction history.

create type verdict_rule as enum ('insufficient_independent_evidence','not_verifiable','uncited');

-- Unverifiable claims have no evidence base to rate.
alter table verdicts alter column confidence drop not null;
alter table verdicts add column confidence_factors jsonb not null default '[]';
alter table verdicts add column adjusted_from verdict_value;
alter table verdicts add column rule verdict_rule;
alter table verdicts add constraint verdict_confidence_presence
  check ((value = 'unverifiable') = (confidence is null));

-- Re-checks add research rounds; keep a generous but finite cap.
alter table investigations drop constraint if exists investigations_rounds_check;
alter table investigations add constraint investigations_rounds_check check (rounds between 0 and 50);
alter table research_queries drop constraint if exists research_queries_round_check;
alter table research_queries add constraint research_queries_round_check check (round between 1 and 50);
alter table evidence drop constraint if exists evidence_round_check;
alter table evidence add constraint evidence_round_check check (round between 1 and 50);

-- report_revisions (0001) stores previous verdicts; add what replaced them and what was new.
alter table report_revisions add column new_verdicts jsonb not null default '[]';
alter table report_revisions add column new_source_ids uuid[] not null default '{}';
alter table report_revisions add column changed boolean not null default false;
-- change_reason is now derived from the structured fields; keep the column for free-text notes.
alter table report_revisions alter column change_reason set default '';
alter table report_revisions drop constraint if exists report_revisions_revision_check;
alter table report_revisions add constraint report_revisions_revision_check check (revision between 1 and 10);
