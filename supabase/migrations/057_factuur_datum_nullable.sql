-- Concept-facturen krijgen pas een datum bij verzending (zie actions.ts → sendFactuurEmail).
-- Voor concept-facturen die nog niet zijn verstuurd willen we geen voorlopige plaatsdatum
-- in de boekhouding/UI/PDF tonen. Maak datum daarom nullable; de send-flow vult vandaag in
-- op moment van versturen, samen met vervaldatum (concept → verzonden).
alter table facturen
  alter column datum drop not null,
  alter column datum drop default;
