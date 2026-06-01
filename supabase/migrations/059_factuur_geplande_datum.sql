-- Geplande verzenddatum voor (concept-)facturen: de datum waarop je van plan
-- bent de factuur te versturen — typisch 3-4 weken vooruit, of de maand waarin
-- de klus valt. Losgekoppeld van `datum` (= de datum ÓP de factuur, die pas bij
-- daadwerkelijk versturen wordt gezet, zie sendFactuurEmail).
--
-- Concepten versturen nooit automatisch; dit veld voedt alleen het
-- planning-overzicht en de 'klaar om te versturen'-signalering. Nullable.
alter table facturen
  add column if not exists geplande_datum date;

comment on column facturen.geplande_datum is
  'Geplande verzenddatum van een concept-factuur (planning, geen auto-verzending). datum = datum op de factuur, gezet bij versturen.';

create index if not exists idx_facturen_geplande_datum
  on facturen(administratie_id, geplande_datum)
  where status = 'concept' and geplande_datum is not null;
