# Aanvraagstatus vasthouden, rebranding naar CliqCRM en juiste formuliergegevens

## 1. Status blijft staan na een bewerking

Wat er nu gebeurt: als je een aanvraag op "Optie" (of Gecontacteerd, Offerte, enz.) zet, kan de eerstvolgende synchronisatie die status weer terugzetten naar "Nieuwe aanvraag".

Bevestigd in de code en data:
- De sync vergelijkt "wie was het laatst gewijzigd" door twee tijdstempels als **tekst** te vergelijken (CRM-formaat `...+00:00` versus het formaat van de externe agenda `...Z`). Die vergelijking valt structureel de verkeerde kant op, waardoor de externe status wint terwijl de gebruiker net iets wijzigde.
- In de database staan 3 aanvragen met status "Nieuwe aanvraag" terwijl ze ná aanmaak nog bewerkt zijn — precies het beeld dat gemeld wordt.
- Daarnaast schrijft de sync bij grote runs alle aanvragen tegelijk weg (honderden rijen met exact hetzelfde wijzigingsmoment), waardoor "laatst gewijzigd" geen betrouwbaar signaal meer is.

Aanpak:
- Nieuw veld dat vastlegt wanneer de status **in dit CRM** door een medewerker is gewijzigd (zelfde principe als bij taken).
- De statuskeuze in het CRM is 24 uur lang leidend: inkomende sync mag de status in die periode niet overschrijven, alleen de overige velden (naam, bedrag, gegevens).
- Tijdstempels worden echt als datum/tijd vergeleken in plaats van als tekst.
- De sync werkt alleen rijen bij die daadwerkelijk gewijzigd zijn, zodat "laatst gewijzigd" weer betekenis heeft.
- Eenmalige herstelactie: aanvragen die zichtbaar teruggezet zijn naar "Nieuwe aanvraag" terugbrengen naar de status die in de externe pipeline staat, zodat het label weer klopt.

## 2. VirtuGrow wordt CliqCRM

Alle zichtbare teksten worden omgezet: menu's, knoppen, meldingen ("Gesynchroniseerd met VirtuGrow"), instellingenpagina, importschermen, e-mail- en documentteksten, paginatitel en omschrijving in de browser, plus de Nederlandse en Engelse vertaalteksten. Ook de logregels en meldingen uit de achtergrondfuncties gaan mee.

Wat bewust niet verandert: technische sleutels en veldnamen in de koppeling zelf (zoals de bestaande API-instellingen), omdat die met de externe partij vastliggen. De naam van de externe bron in labels wordt neutraal ("Koppeling"/"CliqCRM").

## 3. Formuliergegevens correct in het CRM

De gedeelde veldherkenning is al ingebouwd voor de sync, webhook en verrijkingsfunctie. Wat nog gebeurt:
- Aanvullen van de herkende formuliervragen (bedrijfsnaam, aantal gasten, datum, dagdeel/start- en eindtijd, zaalopstelling, catering, benodigdheden, budget, opmerkingen) zodat afwijkende labelnamen ook binnenkomen.
- Bij binnenkomst direct verrijken en het bedrijf koppelen; als het bedrijf niet bestaat wordt het aangemaakt en de contactpersoon eraan gekoppeld.
- Als de eerste poging op een limiet van de koppeling stuit, wordt de verrijking opnieuw geprobeerd in plaats van een lege aanvraag te laten staan.
- Op de aanvraagpagina worden alle ingevulde antwoorden netjes weergegeven (geen weggevallen of door elkaar staande regels).
- Eenmalige herverrijking van de aanvragen van de afgelopen periode die nog lege velden hebben.

## Technische details

- Migratie: `inquiries.local_status_changed_at` (timestamptz) + trigger die dit zet bij een statuswijziging; backfill van bestaande rijen.
- `supabase/functions/ghl-auto-sync/index.ts` en `ghl-webhook/index.ts`: `Date.parse()`-vergelijking in plaats van string-vergelijking, statusbescherming binnen 24 uur, en alleen wegschrijven bij echte verschillen.
- `supabase/functions/_shared/inquiryFields.ts`: uitbreiding `KNOWN_FORM_KEYS` en tijd/datum-parsers.
- Frontend: statuswijzigingen in `InquiryDetailPage.tsx` / `InquiriesPage.tsx` / `InquiryStatusChangeDialog.tsx` zetten het nieuwe veld mee.
- Rebranding: tekstvervanging in ca. 20 bestanden (o.a. `LanguageContext.tsx`, `SettingsPage.tsx`, `index.html`), env-namen ongemoeid.
