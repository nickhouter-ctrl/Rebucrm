-- Vrije dagen / verlof van medewerkers. Medewerker vraagt aan, admin (Nick)
-- keurt goed. Goedgekeurde periodes verschijnen in de agenda; aan het eind van
-- de maand gaat een overzicht van de vrije uren naar de boekhouding (Joost).
create table if not exists vrije_dagen (
  id uuid primary key default gen_random_uuid(),
  administratie_id uuid not null references administraties(id) on delete cascade,
  medewerker_id uuid references medewerkers(id) on delete cascade,
  start_datum date not null,
  eind_datum date not null,
  aantal_uren numeric(6,2),
  type text not null default 'vakantie' check (type in ('vakantie','verlof','ziek','bijzonder')),
  reden text,
  status text not null default 'aangevraagd' check (status in ('aangevraagd','goedgekeurd','afgewezen')),
  aangevraagd_op timestamptz not null default now(),
  beoordeeld_op timestamptz,
  beoordeeld_door uuid references profielen(id),
  -- Voorkomt dubbele klant-vooraankondigingsmails per periode.
  vooraankondiging_verstuurd_op timestamptz,
  created_at timestamptz default now()
);

alter table vrije_dagen enable row level security;

create policy "Vrije dagen zichtbaar voor administratie" on vrije_dagen
  for all using (
    administratie_id in (select administratie_id from profielen where id = auth.uid())
  );

create index if not exists idx_vrije_dagen_admin_datum on vrije_dagen(administratie_id, start_datum, eind_datum);
create index if not exists idx_vrije_dagen_status on vrije_dagen(administratie_id, status);
