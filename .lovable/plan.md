# Meerdere bedrijven/contactpersonen direct bij elke nieuwe taak

## Doel
Bij het aanmaken van een nieuwe taak kun je meteen meerdere bedrijven en/of contactpersonen kiezen, zonder eerst een aparte "Bulk"-optie te selecteren.

## Wat er verandert

### Taken-pagina, dialoog "Nieuwe taak"
- De aparte keuze **Bulk (meerdere bedrijven / contactpersonen)** verdwijnt uit "Koppel taak aan". De keuzes blijven: Aanvraag, Bedrijf + contactpersoon, Alleen contactpersoon.
- Bij **Bedrijf + contactpersoon** en **Alleen contactpersoon** worden de velden altijd meervoudig: je kunt bedrijf na bedrijf en contactpersoon na contactpersoon toevoegen. Gekozen items staan als verwijderbare labels onder het veld.
- Kies je één bedrijf, dan blijft de contactpersonenlijst gefilterd op dat bedrijf; kies je meerdere bedrijven, dan zijn alle actieve contactpersonen selecteerbaar (uit dienst blijft verborgen).
- Onder de velden staat een teller: "Er worden X taken aangemaakt" (koppelingen × verantwoordelijken). Bij precies één koppeling en één verantwoordelijke blijft de teller weg.
- Bij opslaan krijgt elke koppeling zijn eigen taak, met dezelfde titel, omschrijving, datum, tijd en verantwoordelijke(n). Bij een contactpersoon wordt het bijbehorende bedrijf automatisch meegekoppeld.
- Eén bedrijf + één contactpersoon samen blijft één taak (huidige gedrag), zodat bestaande werkwijze niet verandert.

### Aanvraag-modus
Blijft ongewijzigd: één aanvraag per taak.

### Overige pagina's
Nieuwe taak vanuit Bedrijf, Contactpersoon of Aanvraag blijft ongewijzigd — daar is de koppeling al bekend.

## Technische details
- `src/pages/TasksPage.tsx`: `linkType` terug naar `'inquiry' | 'company' | 'contact'`; `companyIds`/`contactIds` blijven de bron voor de koppelvelden in beide niet-aanvraag modi.
- Koppelingenlijst in `handleSave`: bij precies 1 bedrijf én 1 contactpersoon → één taak met beide id's; anders één taak per bedrijf en per contactpersoon (contactpersoon erft `company_id`).
- Multi-select met de bestaande `CrmCombobox` (selectie voegt toe aan de array) plus badges met verwijder-knop; contactopties uit `bulkContactOptions` wanneer meerdere of geen bedrijven gekozen zijn.
- Geen databasewijziging nodig.
