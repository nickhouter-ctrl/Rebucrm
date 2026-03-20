-- Afspraken tabel voor agenda
create table afspraken (
  id uuid primary key default gen_random_uuid(),
  administratie_id uuid not null references administraties(id) on delete cascade,
  titel text not null,
  omschrijving text,
  start_datum timestamptz not null,
  eind_datum timestamptz,
  hele_dag boolean default false,
  locatie text,
  relatie_id uuid references relaties(id),
  lead_id uuid references leads(id),
  project_id uuid references projecten(id),
  created_at timestamptz default now()
);

-- RLS
alter table afspraken enable row level security;

create policy "Afspraken zichtbaar voor administratie" on afspraken
  for all using (
    administratie_id in (
      select administratie_id from profielen where id = auth.uid()
    )
  );
