-- Leads tabel voor CRM pijplijn
create table leads (
  id uuid primary key default gen_random_uuid(),
  administratie_id uuid not null references administraties(id) on delete cascade,
  bedrijfsnaam text not null,
  contactpersoon text,
  email text,
  telefoon text,
  adres text,
  postcode text,
  plaats text,
  bron text default 'handmatig',
  status text default 'nieuw'
    check (status in ('nieuw','gecontacteerd','offerte_verstuurd','gewonnen','verloren')),
  notities text,
  terugbel_datum timestamptz,
  terugbel_notitie text,
  relatie_id uuid references relaties(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS
alter table leads enable row level security;

create policy "Leads zichtbaar voor administratie" on leads
  for all using (
    administratie_id in (
      select administratie_id from profielen where id = auth.uid()
    )
  );

-- Taken koppelen aan leads
alter table taken add column lead_id uuid references leads(id);
