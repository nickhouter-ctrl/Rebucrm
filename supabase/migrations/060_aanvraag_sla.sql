-- SLA-laag voor offerte-aanvragen (taken met titel 'Nieuwe aanvraag - offerte
-- nog te maken'). De offerte moet binnen 20 uur terug naar de klant; bij een
-- grote offerte kan dat verlengd worden naar 48 uur (met automatische
-- terugkoppelmail). Zo kunnen we op een dashboard zien of alles op tijd gaat.
alter table taken
  add column if not exists sla_deadline timestamptz,
  add column if not exists sla_verlengd boolean not null default false,
  add column if not exists teruggestuurd_op timestamptz;

comment on column taken.sla_deadline is 'SLA-deadline aanvraag: offerte moet hiervoor terug naar klant (start 20u, verlengd 48u).';
comment on column taken.sla_verlengd is 'True als de SLA naar 48u is verlengd (met terugkoppelmail naar klant).';
comment on column taken.teruggestuurd_op is 'Moment waarop de offerte naar de klant is verstuurd — bepaalt of de SLA is gehaald.';

create index if not exists idx_taken_sla_deadline
  on taken(administratie_id, sla_deadline)
  where sla_deadline is not null and teruggestuurd_op is null;
