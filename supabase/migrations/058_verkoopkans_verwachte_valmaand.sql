-- Verwachte valmaand voor verkoopkansen (projecten): de maand waarin de deal
-- naar verwachting valt/sluit. Voedt de maand-prognose in Rapportages
-- (reeds gevallen omzet + conversie × geplande verkoopkansen, afgezet tegen
-- het omzetdoel). Opgeslagen als eerste-van-de-maand datum; nullable zodat
-- bestaande verkoopkansen ongemoeid blijven tot iemand een maand kiest.
alter table projecten
  add column if not exists verwachte_valmaand date;

comment on column projecten.verwachte_valmaand is
  'Verwachte maand waarin deze verkoopkans valt (1e van de maand). Voor maand-prognose.';
