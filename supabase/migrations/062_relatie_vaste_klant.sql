-- Markering 'vaste klant' op relaties. Bepaalt wie een vooraankondiging krijgt
-- als een medewerker met vakantie gaat ("we reageren wat minder snel, mail
-- info@ voor sneller contact"). Alleen gemarkeerde klanten worden gemaild —
-- nooit automatisch iedereen, zodat er geen ongewenste massa-mail uitgaat.
alter table relaties
  add column if not exists vaste_klant boolean not null default false;

create index if not exists idx_relaties_vaste_klant
  on relaties(administratie_id) where vaste_klant = true;
