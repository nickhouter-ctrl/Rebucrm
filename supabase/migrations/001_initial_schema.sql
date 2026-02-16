-- ============================================
-- Rebu - Initieel Database Schema
-- ============================================

-- === ADMINISTRATIES ===
create table administraties (
  id uuid primary key default gen_random_uuid(),
  naam text not null,
  kvk_nummer text,
  btw_nummer text,
  adres text,
  postcode text,
  plaats text,
  land text default 'Nederland',
  telefoon text,
  email text,
  website text,
  iban text,
  bic text,
  logo_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- === PROFIELEN ===
create table profielen (
  id uuid primary key references auth.users on delete cascade,
  administratie_id uuid references administraties(id),
  naam text not null,
  email text not null,
  rol text default 'gebruiker' check (rol in ('admin', 'gebruiker', 'readonly')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- === RELATIES ===
create table relaties (
  id uuid primary key default gen_random_uuid(),
  administratie_id uuid not null references administraties(id) on delete cascade,
  type text not null check (type in ('klant', 'leverancier', 'beide')),
  bedrijfsnaam text not null,
  contactpersoon text,
  email text,
  telefoon text,
  adres text,
  postcode text,
  plaats text,
  land text default 'Nederland',
  kvk_nummer text,
  btw_nummer text,
  iban text,
  opmerkingen text,
  actief boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- === PRODUCTEN ===
create table producten (
  id uuid primary key default gen_random_uuid(),
  administratie_id uuid not null references administraties(id) on delete cascade,
  naam text not null,
  omschrijving text,
  eenheid text default 'stuk',
  prijs numeric(12,2) not null default 0,
  btw_percentage integer default 21 check (btw_percentage in (0, 9, 21)),
  type text default 'product' check (type in ('product', 'dienst')),
  voorraad_bijhouden boolean default false,
  voorraad integer default 0,
  artikelnummer text,
  actief boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- === OFFERTES ===
create table offertes (
  id uuid primary key default gen_random_uuid(),
  administratie_id uuid not null references administraties(id) on delete cascade,
  relatie_id uuid references relaties(id),
  offertenummer text not null,
  datum date not null default current_date,
  geldig_tot date,
  status text default 'concept' check (status in ('concept', 'verzonden', 'geaccepteerd', 'afgewezen', 'verlopen')),
  onderwerp text,
  inleiding text,
  subtotaal numeric(12,2) default 0,
  btw_totaal numeric(12,2) default 0,
  totaal numeric(12,2) default 0,
  opmerkingen text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table offerte_regels (
  id uuid primary key default gen_random_uuid(),
  offerte_id uuid not null references offertes(id) on delete cascade,
  product_id uuid references producten(id),
  omschrijving text not null,
  aantal numeric(12,2) default 1,
  prijs numeric(12,2) default 0,
  btw_percentage integer default 21,
  totaal numeric(12,2) default 0,
  volgorde integer default 0
);

-- === ORDERS ===
create table orders (
  id uuid primary key default gen_random_uuid(),
  administratie_id uuid not null references administraties(id) on delete cascade,
  relatie_id uuid references relaties(id),
  offerte_id uuid references offertes(id),
  ordernummer text not null,
  datum date not null default current_date,
  leverdatum date,
  status text default 'nieuw' check (status in ('nieuw', 'in_behandeling', 'geleverd', 'gefactureerd', 'geannuleerd')),
  onderwerp text,
  subtotaal numeric(12,2) default 0,
  btw_totaal numeric(12,2) default 0,
  totaal numeric(12,2) default 0,
  opmerkingen text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table order_regels (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references producten(id),
  omschrijving text not null,
  aantal numeric(12,2) default 1,
  prijs numeric(12,2) default 0,
  btw_percentage integer default 21,
  totaal numeric(12,2) default 0,
  volgorde integer default 0
);

-- === FACTUREN ===
create table facturen (
  id uuid primary key default gen_random_uuid(),
  administratie_id uuid not null references administraties(id) on delete cascade,
  relatie_id uuid references relaties(id),
  order_id uuid references orders(id),
  factuurnummer text not null,
  datum date not null default current_date,
  vervaldatum date,
  status text default 'concept' check (status in ('concept', 'verzonden', 'betaald', 'deels_betaald', 'vervallen', 'gecrediteerd')),
  onderwerp text,
  subtotaal numeric(12,2) default 0,
  btw_totaal numeric(12,2) default 0,
  totaal numeric(12,2) default 0,
  betaald_bedrag numeric(12,2) default 0,
  opmerkingen text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table factuur_regels (
  id uuid primary key default gen_random_uuid(),
  factuur_id uuid not null references facturen(id) on delete cascade,
  product_id uuid references producten(id),
  omschrijving text not null,
  aantal numeric(12,2) default 1,
  prijs numeric(12,2) default 0,
  btw_percentage integer default 21,
  totaal numeric(12,2) default 0,
  volgorde integer default 0
);

-- === BOEKHOUDING ===
create table grootboekrekeningen (
  id uuid primary key default gen_random_uuid(),
  administratie_id uuid not null references administraties(id) on delete cascade,
  nummer text not null,
  naam text not null,
  type text not null check (type in ('activa', 'passiva', 'kosten', 'omzet')),
  omschrijving text,
  actief boolean default true,
  created_at timestamptz default now()
);

create table boekingen (
  id uuid primary key default gen_random_uuid(),
  administratie_id uuid not null references administraties(id) on delete cascade,
  boekingsnummer text not null,
  datum date not null default current_date,
  omschrijving text not null,
  factuur_id uuid references facturen(id),
  inkoopfactuur_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table boekingsregels (
  id uuid primary key default gen_random_uuid(),
  boeking_id uuid not null references boekingen(id) on delete cascade,
  grootboekrekening_id uuid not null references grootboekrekeningen(id),
  debet numeric(12,2) default 0,
  credit numeric(12,2) default 0,
  omschrijving text
);

-- === PROJECTEN ===
create table projecten (
  id uuid primary key default gen_random_uuid(),
  administratie_id uuid not null references administraties(id) on delete cascade,
  relatie_id uuid references relaties(id),
  naam text not null,
  omschrijving text,
  status text default 'actief' check (status in ('actief', 'afgerond', 'on_hold', 'geannuleerd')),
  startdatum date,
  einddatum date,
  budget numeric(12,2),
  uurtarief numeric(12,2),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- === UREN ===
create table uren (
  id uuid primary key default gen_random_uuid(),
  administratie_id uuid not null references administraties(id) on delete cascade,
  project_id uuid references projecten(id),
  gebruiker_id uuid references profielen(id),
  datum date not null default current_date,
  uren numeric(5,2) not null,
  omschrijving text,
  facturabel boolean default true,
  gefactureerd boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- === TAKEN ===
create table taken (
  id uuid primary key default gen_random_uuid(),
  administratie_id uuid not null references administraties(id) on delete cascade,
  project_id uuid references projecten(id),
  toegewezen_aan uuid references profielen(id),
  titel text not null,
  omschrijving text,
  status text default 'open' check (status in ('open', 'in_uitvoering', 'afgerond')),
  prioriteit text default 'normaal' check (prioriteit in ('laag', 'normaal', 'hoog', 'urgent')),
  deadline date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- === INKOOPFACTUREN ===
create table inkoopfacturen (
  id uuid primary key default gen_random_uuid(),
  administratie_id uuid not null references administraties(id) on delete cascade,
  relatie_id uuid references relaties(id),
  factuurnummer text not null,
  datum date not null default current_date,
  vervaldatum date,
  status text default 'open' check (status in ('open', 'betaald', 'betwist')),
  subtotaal numeric(12,2) default 0,
  btw_totaal numeric(12,2) default 0,
  totaal numeric(12,2) default 0,
  document_url text,
  opmerkingen text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table inkoopfactuur_regels (
  id uuid primary key default gen_random_uuid(),
  inkoopfactuur_id uuid not null references inkoopfacturen(id) on delete cascade,
  omschrijving text not null,
  aantal numeric(12,2) default 1,
  prijs numeric(12,2) default 0,
  btw_percentage integer default 21,
  totaal numeric(12,2) default 0,
  grootboekrekening_id uuid references grootboekrekeningen(id),
  volgorde integer default 0
);

-- Nu de foreign key toevoegen voor boekingen -> inkoopfacturen
alter table boekingen
  add constraint boekingen_inkoopfactuur_fk
  foreign key (inkoopfactuur_id) references inkoopfacturen(id);

-- === DOCUMENTEN ===
create table documenten (
  id uuid primary key default gen_random_uuid(),
  administratie_id uuid not null references administraties(id) on delete cascade,
  naam text not null,
  bestandsnaam text not null,
  bestandstype text,
  bestandsgrootte integer,
  storage_path text not null,
  entiteit_type text,
  entiteit_id uuid,
  geupload_door uuid references profielen(id),
  created_at timestamptz default now()
);

-- === NUMMERING ===
create table nummering (
  id uuid primary key default gen_random_uuid(),
  administratie_id uuid not null references administraties(id) on delete cascade,
  type text not null check (type in ('offerte', 'order', 'factuur', 'inkoopfactuur', 'boeking')),
  prefix text default '',
  volgend_nummer integer default 1,
  unique(administratie_id, type)
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

alter table administraties enable row level security;
alter table profielen enable row level security;
alter table relaties enable row level security;
alter table producten enable row level security;
alter table offertes enable row level security;
alter table offerte_regels enable row level security;
alter table orders enable row level security;
alter table order_regels enable row level security;
alter table facturen enable row level security;
alter table factuur_regels enable row level security;
alter table grootboekrekeningen enable row level security;
alter table boekingen enable row level security;
alter table boekingsregels enable row level security;
alter table projecten enable row level security;
alter table uren enable row level security;
alter table taken enable row level security;
alter table inkoopfacturen enable row level security;
alter table inkoopfactuur_regels enable row level security;
alter table documenten enable row level security;
alter table nummering enable row level security;

-- Profiel: gebruiker ziet eigen profiel
create policy "Gebruikers zien eigen profiel" on profielen
  for select using (id = auth.uid());
create policy "Gebruikers updaten eigen profiel" on profielen
  for update using (id = auth.uid());
create policy "Profiel aanmaken bij registratie" on profielen
  for insert with check (id = auth.uid());

-- Administratie: via profiel
create policy "Gebruikers zien eigen administratie" on administraties
  for select using (
    id in (select administratie_id from profielen where id = auth.uid())
  );
create policy "Gebruikers updaten eigen administratie" on administraties
  for update using (
    id in (select administratie_id from profielen where id = auth.uid())
  );
create policy "Administratie aanmaken" on administraties
  for insert with check (true);

-- Macro voor administratie-gebonden tabellen
-- Relaties
create policy "relaties_select" on relaties for select using (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);
create policy "relaties_insert" on relaties for insert with check (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);
create policy "relaties_update" on relaties for update using (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);
create policy "relaties_delete" on relaties for delete using (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);

-- Producten
create policy "producten_select" on producten for select using (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);
create policy "producten_insert" on producten for insert with check (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);
create policy "producten_update" on producten for update using (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);
create policy "producten_delete" on producten for delete using (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);

-- Offertes
create policy "offertes_select" on offertes for select using (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);
create policy "offertes_insert" on offertes for insert with check (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);
create policy "offertes_update" on offertes for update using (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);
create policy "offertes_delete" on offertes for delete using (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);

-- Offerte regels (via offerte)
create policy "offerte_regels_select" on offerte_regels for select using (
  offerte_id in (select id from offertes where administratie_id in (select administratie_id from profielen where id = auth.uid()))
);
create policy "offerte_regels_insert" on offerte_regels for insert with check (
  offerte_id in (select id from offertes where administratie_id in (select administratie_id from profielen where id = auth.uid()))
);
create policy "offerte_regels_update" on offerte_regels for update using (
  offerte_id in (select id from offertes where administratie_id in (select administratie_id from profielen where id = auth.uid()))
);
create policy "offerte_regels_delete" on offerte_regels for delete using (
  offerte_id in (select id from offertes where administratie_id in (select administratie_id from profielen where id = auth.uid()))
);

-- Orders
create policy "orders_select" on orders for select using (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);
create policy "orders_insert" on orders for insert with check (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);
create policy "orders_update" on orders for update using (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);
create policy "orders_delete" on orders for delete using (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);

-- Order regels
create policy "order_regels_select" on order_regels for select using (
  order_id in (select id from orders where administratie_id in (select administratie_id from profielen where id = auth.uid()))
);
create policy "order_regels_insert" on order_regels for insert with check (
  order_id in (select id from orders where administratie_id in (select administratie_id from profielen where id = auth.uid()))
);
create policy "order_regels_update" on order_regels for update using (
  order_id in (select id from orders where administratie_id in (select administratie_id from profielen where id = auth.uid()))
);
create policy "order_regels_delete" on order_regels for delete using (
  order_id in (select id from orders where administratie_id in (select administratie_id from profielen where id = auth.uid()))
);

-- Facturen
create policy "facturen_select" on facturen for select using (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);
create policy "facturen_insert" on facturen for insert with check (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);
create policy "facturen_update" on facturen for update using (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);
create policy "facturen_delete" on facturen for delete using (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);

-- Factuur regels
create policy "factuur_regels_select" on factuur_regels for select using (
  factuur_id in (select id from facturen where administratie_id in (select administratie_id from profielen where id = auth.uid()))
);
create policy "factuur_regels_insert" on factuur_regels for insert with check (
  factuur_id in (select id from facturen where administratie_id in (select administratie_id from profielen where id = auth.uid()))
);
create policy "factuur_regels_update" on factuur_regels for update using (
  factuur_id in (select id from facturen where administratie_id in (select administratie_id from profielen where id = auth.uid()))
);
create policy "factuur_regels_delete" on factuur_regels for delete using (
  factuur_id in (select id from facturen where administratie_id in (select administratie_id from profielen where id = auth.uid()))
);

-- Grootboekrekeningen
create policy "grootboekrekeningen_select" on grootboekrekeningen for select using (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);
create policy "grootboekrekeningen_insert" on grootboekrekeningen for insert with check (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);
create policy "grootboekrekeningen_update" on grootboekrekeningen for update using (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);
create policy "grootboekrekeningen_delete" on grootboekrekeningen for delete using (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);

-- Boekingen
create policy "boekingen_select" on boekingen for select using (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);
create policy "boekingen_insert" on boekingen for insert with check (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);
create policy "boekingen_update" on boekingen for update using (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);
create policy "boekingen_delete" on boekingen for delete using (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);

-- Boekingsregels
create policy "boekingsregels_select" on boekingsregels for select using (
  boeking_id in (select id from boekingen where administratie_id in (select administratie_id from profielen where id = auth.uid()))
);
create policy "boekingsregels_insert" on boekingsregels for insert with check (
  boeking_id in (select id from boekingen where administratie_id in (select administratie_id from profielen where id = auth.uid()))
);
create policy "boekingsregels_update" on boekingsregels for update using (
  boeking_id in (select id from boekingen where administratie_id in (select administratie_id from profielen where id = auth.uid()))
);
create policy "boekingsregels_delete" on boekingsregels for delete using (
  boeking_id in (select id from boekingen where administratie_id in (select administratie_id from profielen where id = auth.uid()))
);

-- Projecten
create policy "projecten_select" on projecten for select using (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);
create policy "projecten_insert" on projecten for insert with check (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);
create policy "projecten_update" on projecten for update using (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);
create policy "projecten_delete" on projecten for delete using (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);

-- Uren
create policy "uren_select" on uren for select using (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);
create policy "uren_insert" on uren for insert with check (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);
create policy "uren_update" on uren for update using (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);
create policy "uren_delete" on uren for delete using (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);

-- Taken
create policy "taken_select" on taken for select using (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);
create policy "taken_insert" on taken for insert with check (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);
create policy "taken_update" on taken for update using (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);
create policy "taken_delete" on taken for delete using (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);

-- Inkoopfacturen
create policy "inkoopfacturen_select" on inkoopfacturen for select using (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);
create policy "inkoopfacturen_insert" on inkoopfacturen for insert with check (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);
create policy "inkoopfacturen_update" on inkoopfacturen for update using (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);
create policy "inkoopfacturen_delete" on inkoopfacturen for delete using (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);

-- Inkoopfactuur regels
create policy "inkoopfactuur_regels_select" on inkoopfactuur_regels for select using (
  inkoopfactuur_id in (select id from inkoopfacturen where administratie_id in (select administratie_id from profielen where id = auth.uid()))
);
create policy "inkoopfactuur_regels_insert" on inkoopfactuur_regels for insert with check (
  inkoopfactuur_id in (select id from inkoopfacturen where administratie_id in (select administratie_id from profielen where id = auth.uid()))
);
create policy "inkoopfactuur_regels_update" on inkoopfactuur_regels for update using (
  inkoopfactuur_id in (select id from inkoopfacturen where administratie_id in (select administratie_id from profielen where id = auth.uid()))
);
create policy "inkoopfactuur_regels_delete" on inkoopfactuur_regels for delete using (
  inkoopfactuur_id in (select id from inkoopfacturen where administratie_id in (select administratie_id from profielen where id = auth.uid()))
);

-- Documenten
create policy "documenten_select" on documenten for select using (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);
create policy "documenten_insert" on documenten for insert with check (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);
create policy "documenten_delete" on documenten for delete using (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);

-- Nummering
create policy "nummering_select" on nummering for select using (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);
create policy "nummering_insert" on nummering for insert with check (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);
create policy "nummering_update" on nummering for update using (
  administratie_id in (select administratie_id from profielen where id = auth.uid())
);

-- ============================================
-- FUNCTIES
-- ============================================

-- Updated_at trigger functie
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Triggers voor updated_at
create trigger set_updated_at before update on administraties for each row execute function update_updated_at();
create trigger set_updated_at before update on profielen for each row execute function update_updated_at();
create trigger set_updated_at before update on relaties for each row execute function update_updated_at();
create trigger set_updated_at before update on producten for each row execute function update_updated_at();
create trigger set_updated_at before update on offertes for each row execute function update_updated_at();
create trigger set_updated_at before update on orders for each row execute function update_updated_at();
create trigger set_updated_at before update on facturen for each row execute function update_updated_at();
create trigger set_updated_at before update on boekingen for each row execute function update_updated_at();
create trigger set_updated_at before update on projecten for each row execute function update_updated_at();
create trigger set_updated_at before update on uren for each row execute function update_updated_at();
create trigger set_updated_at before update on taken for each row execute function update_updated_at();
create trigger set_updated_at before update on inkoopfacturen for each row execute function update_updated_at();

-- Auto-nummering functie
create or replace function volgende_nummer(p_administratie_id uuid, p_type text)
returns text as $$
declare
  v_prefix text;
  v_nummer integer;
  v_result text;
begin
  update nummering
  set volgend_nummer = volgend_nummer + 1
  where administratie_id = p_administratie_id and type = p_type
  returning prefix, volgend_nummer - 1 into v_prefix, v_nummer;

  if not found then
    insert into nummering (administratie_id, type, prefix, volgend_nummer)
    values (p_administratie_id, p_type,
      case p_type
        when 'offerte' then 'OFF-'
        when 'order' then 'ORD-'
        when 'factuur' then 'FAC-'
        when 'inkoopfactuur' then 'INK-'
        when 'boeking' then 'BOE-'
      end, 2)
    returning prefix into v_prefix;
    v_nummer := 1;
  end if;

  v_result := v_prefix || lpad(v_nummer::text, 4, '0');
  return v_result;
end;
$$ language plpgsql;

-- Profiel auto-aanmaak bij registratie
create or replace function handle_new_user()
returns trigger as $$
declare
  v_admin_id uuid;
begin
  -- Maak een administratie aan als er een bedrijfsnaam is meegegeven
  if new.raw_user_meta_data->>'bedrijfsnaam' is not null then
    insert into administraties (naam)
    values (new.raw_user_meta_data->>'bedrijfsnaam')
    returning id into v_admin_id;

    -- Standaard nummering aanmaken
    insert into nummering (administratie_id, type, prefix, volgend_nummer) values
      (v_admin_id, 'offerte', 'OFF-', 1),
      (v_admin_id, 'order', 'ORD-', 1),
      (v_admin_id, 'factuur', 'FAC-', 1),
      (v_admin_id, 'inkoopfactuur', 'INK-', 1),
      (v_admin_id, 'boeking', 'BOE-', 1);

    -- Standaard grootboekrekeningen
    insert into grootboekrekeningen (administratie_id, nummer, naam, type) values
      (v_admin_id, '0100', 'Gebouwen', 'activa'),
      (v_admin_id, '0200', 'Inventaris', 'activa'),
      (v_admin_id, '1000', 'Kas', 'activa'),
      (v_admin_id, '1100', 'Bank', 'activa'),
      (v_admin_id, '1300', 'Debiteuren', 'activa'),
      (v_admin_id, '1600', 'Crediteuren', 'passiva'),
      (v_admin_id, '2000', 'Eigen vermogen', 'passiva'),
      (v_admin_id, '4000', 'Inkoopwaarde', 'kosten'),
      (v_admin_id, '4100', 'Kantoorkosten', 'kosten'),
      (v_admin_id, '4200', 'Huisvestingskosten', 'kosten'),
      (v_admin_id, '4300', 'Vervoerskosten', 'kosten'),
      (v_admin_id, '4400', 'Personeelskosten', 'kosten'),
      (v_admin_id, '4500', 'Afschrijvingen', 'kosten'),
      (v_admin_id, '4900', 'Overige kosten', 'kosten'),
      (v_admin_id, '8000', 'Omzet producten', 'omzet'),
      (v_admin_id, '8100', 'Omzet diensten', 'omzet'),
      (v_admin_id, '8900', 'Overige omzet', 'omzet');
  end if;

  -- Maak profiel aan
  insert into profielen (id, administratie_id, naam, email, rol)
  values (
    new.id,
    v_admin_id,
    coalesce(new.raw_user_meta_data->>'naam', new.email),
    new.email,
    'admin'
  );

  return new;
end;
$$ language plpgsql security definer;

-- Trigger voor nieuwe gebruikers
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
