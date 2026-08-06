# Tags bij contactpersonen: alleen kiezen uit bestaande GHL-tags

## Waarom de knop nu leeg is

De tagkeuzelijst wordt nu opgebouwd uit tags die al bij contactpersonen in deze tool staan. Een controle in de database laat zien: van de 1332 contactpersonen heeft er **0** tags. Tags worden namelijk nergens uit GHL meegesynchroniseerd, dus de lijst is per definitie leeg en het enige dat werkt is zelf een tag typen — precies wat we niet willen.

## Wat er gebeurt

1. **Taglijst uit GHL ophalen** — de volledige lijst met beschikbare tags van de GHL-locatie wordt opgehaald en opgeslagen in een nieuwe tabel `ghl_tags` (naam + GHL-id). Deze lijst wordt bijgewerkt bij elke sync, zodat nieuwe tags die in de "oude" omgeving worden aangemaakt hier automatisch verschijnen.
2. **Tags per contactpersoon meesyncen** — bij het binnenhalen van contactpersonen worden hun tags overgenomen in het veld `tags`, zodat bestaande labels direct zichtbaar zijn op de contactkaart.
3. **Dropdown wordt keuzelijst** — de tagknop op de contactpagina toont de volledige GHL-taglijst met zoekveld. Nieuwe tags aanmaken wordt uitgeschakeld: geen "Maak tag …"-optie, Enter maakt niets aan, en bij geen resultaat verschijnt de melding dat tags in de oude omgeving beheerd worden.
4. **Selectie ook naar GHL** — toevoegen of verwijderen van een tag wordt direct naar het GHL-contact geschreven, zodat beide systemen gelijk blijven.

## Technisch

- Migratie: tabel `public.ghl_tags` (`id`, `ghl_tag_id`, `name`, `created_at`, `updated_at`), unieke index op naam, GRANTs voor `authenticated` (lezen) en `service_role` (volledig), RLS aan.
- `supabase/functions/ghl-sync/index.ts`:
  - nieuwe actie `sync-tags` → `GET /locations/{locationId}/tags`, upsert in `ghl_tags`.
  - `sync-contacts` slaat `tags` van elk GHL-contact op.
  - nieuwe actie `push-contact-tags` → tags van het contact wegschrijven via de contact-update (`tags`-array).
- `supabase/functions/ghl-auto-sync/index.ts`: `sync-tags` meenemen in de reguliere sync.
- Nieuwe hook `src/hooks/useGhlTags.ts` die `ghl_tags` leest.
- `src/pages/ContactDetailPage.tsx`: taglijst uit de hook i.p.v. uit bestaande contacten; `CommandEmpty` zonder aanmaakknop; Enter-handler verwijderd; na opslaan `push-contact-tags` aanroepen.
- Ook op andere plekken waar tags getoond worden blijft de weergave gelijk; alleen het bewerken verandert.
