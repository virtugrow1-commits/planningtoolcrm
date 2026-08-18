# Aanvraag zonder klikbare contactpersoon oplossen

## Wat er nu gebeurt

Bij Christina Hakkens is de aanvraag (ANV-001827) om 09:31 aangemaakt vanuit VirtuGrow, terwijl haar contactpersoon pas om 10:30 in het CRM terechtkwam. Op het moment van aanmaken bestond de contactpersoon dus nog niet, en de aanvraag werd opgeslagen zonder koppeling naar een contactpersoon. Daardoor is haar naam niet klikbaar.

Pas als je de aanvraag handmatig bewerkt en opslaat, probeert het systeem opnieuw te koppelen — en dán lukt het, omdat de contactpersoon inmiddels wel bestaat. Dat verklaart precies het gedrag dat je ziet.

Er staan nu geen aanvragen meer zonder koppeling open (0 van 411), dus dit is een preventieve fix voor nieuwe aanvragen.

## Wat we oplossen

1. **Direct koppelen bij aanmaken.** De synchronisatie zet de koppeling nu bewust op "leeg", zelfs als de contactpersoon al bekend is. Dat wordt gewijzigd: eerst zoeken op het VirtuGrow-contact-ID, daarna op naam, en pas als niets matcht leeg laten.

2. **Automatisch nakoppelen.** Aan het eind van elke synchronisatieronde worden alle aanvragen zonder contactpersoon opnieuw langs de bestaande naam-matching gehaald (inclusief de Nederlandse tussenvoegsel-logica). Aanvragen die zoals bij Christina "te vroeg" binnenkomen, worden zo binnen de eerstvolgende ronde automatisch gekoppeld — zonder handmatig bewerken.

3. **Vangnet in de weergave.** Als een aanvraag toch nog geen koppeling heeft, zoekt de aanvraagpagina de contactpersoon op naam op. De naam blijft dan klikbaar en het contactprofiel opent gewoon, ook vóór de volgende synchronisatieronde.

## Technische details

- `supabase/functions/ghl-auto-sync/index.ts`: bij het aanmaken van nieuwe opportunity-aanvragen `contact_id: null` vervangen door de opgeloste contact-id via `lookups.contactByGhlId.get(opp.contact.id)` met naam-fallback op `lookups.existingContacts`.
- Zelfde resolutie toepassen in de opportunity-tak van `supabase/functions/ghl-webhook/index.ts` waar nog geen contact wordt opgelost.
- Na de contact-sync in `ghl-auto-sync` (en in `ghl-sync` waar contacten worden aangemaakt) een backfill-stap toevoegen: aanvragen met `contact_id IS NULL` matchen op genormaliseerde naam via de bestaande logica van `auto_link_inquiry_contact` en bijwerken, met logging in `sync_log`.
- Frontend: in `src/pages/InquiryDetailPage.tsx` de `contact`-memo uitbreiden met een naam-fallback op `contacts` (case-insensitief, tussenvoegsels genormaliseerd) zodat `InquiryDetailsTab` de naam klikbaar rendert. Alleen presentatie — de databasekoppeling blijft leidend.

Geen databasemigratie nodig; bestaande triggers en tabellen blijven ongewijzigd.
