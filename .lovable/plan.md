# Taken in bulk aanmaken voor meerdere bedrijven en contactpersonen

## Doel
Eén keer een taak invullen en die meteen laten aanmaken voor meerdere bedrijven en/of contactpersonen, zodat elke koppeling zijn eigen taak krijgt die los afgevinkt kan worden.

## Wat er verandert

### 1. Nieuwe taak-dialoog (Taken-pagina)
- Bij "Koppel taak aan" komt een extra optie: **Bulk (meerdere bedrijven / contactpersonen)**.
- In die modus kies je met een zoekveld meerdere bedrijven en meerdere contactpersonen. Gekozen items komen als verwijderbare labels onder het veld te staan.
- Contactpersonen met status "uit dienst" blijven verborgen, zoals overal in het systeem.
- Onder de knop staat een teller: "Er worden X taken aangemaakt" (aantal koppelingen × aantal verantwoordelijken).
- Bij het opslaan wordt per gekozen bedrijf en per gekozen contactpersoon een eigen taak aangemaakt, met dezelfde titel, omschrijving, prioriteit, datum, tijd en verantwoordelijke(n). Bij een contactpersoon wordt automatisch het bijbehorende bedrijf meegekoppeld.
- Validatie: minimaal één bedrijf of contactpersoon vereist; datum en verantwoordelijke blijven verplicht.
- Na opslaan één melding: "X taken aangemaakt".

De bestaande modi (aanvraag / bedrijf + contactpersoon / alleen contactpersoon) blijven ongewijzigd werken.

### 2. Bulk toewijzen aan bestaande taken
Blijft zoals het is; deze wijziging gaat alleen over aanmaken.

## Technische details
- `src/pages/TasksPage.tsx`: `form.linkType` uitbreiden met `'bulk'`, plus `companyIds: string[]` en `contactIds: string[]` in de formulierstate. Multi-select opgebouwd met de bestaande `CrmCombobox` (selectie voegt toe aan de array) en badges met verwijder-knop.
- `handleSave`: bij `linkType === 'bulk'` een lijst koppelingen samenstellen (`{companyId}` per bedrijf, `{contactId, companyId: contact.companyId}` per contactpersoon) en daarover heen loopen samen met de gekozen verantwoordelijken, met de bestaande `addTask` uit `TasksContext` — per taak volgt de bestaande GHL-push automatisch.
- Geen databasewijziging nodig: elke taak blijft één `company_id`/`contact_id`.
