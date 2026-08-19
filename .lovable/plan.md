# Taak koppelen aan bedrijf, contactpersoon of aanvraag

## Doel
Bij het aanmaken van een taak vastleggen waaraan de taak "hangt": een aanvraag, een bedrijf + contactpersoon, of alleen een contactpersoon (particulier).

## Wat er verandert

### 1. Nieuwe taak-dialoog op de Taken-pagina
Nieuw keuzeveld bovenaan: **Koppel taak aan** met drie opties:
- Aanvraag
- Bedrijf + contactpersoon
- Alleen contactpersoon (particulier)

Gedrag per keuze:
- **Aanvraag**: eerst bedrijf kiezen (bijv. Mijzo), daarna een lijst met alléén de aanvragen van dat bedrijf om er één te selecteren. De aanvraag toont nummer, datum en type (bijv. "ANV-001737 · Kookworkshop · 12-09-2026"). Bij het opslaan worden aanvraag + bedrijf + contactpersoon van die aanvraag automatisch meegekoppeld. Wie geen bedrijf kiest kan direct in alle aanvragen zoeken (op nummer, contactnaam of bedrijf) — handig voor particuliere aanvragen.
- **Bedrijf + contactpersoon**: huidige gedrag; contactpersonenlijst blijft gefilterd op het gekozen bedrijf, medewerkers "uit dienst" blijven verborgen.
- **Alleen contactpersoon**: alleen de contactpersoonkeuze, geen bedrijf.

Validatie: bij keuze "Aanvraag" is een aanvraag verplicht; bij "Bedrijf + contactpersoon" is een bedrijf verplicht. Datum en verantwoordelijke blijven verplicht zoals nu.

### 2. Taken vanuit een aanvraag
Taken die vanuit een aanvraag worden aangemaakt blijven automatisch aan die aanvraag gekoppeld (dat werkt al) — daar verandert niets, behalve dat het bedrijf en de contactpersoon van de aanvraag consequent worden meegeschreven zodat de taak ook bij het bedrijf en de contactpersoon zichtbaar is.

### 3. Zichtbaarheid van de koppeling
In het taken-overzicht en op de taakdetailpagina staat de koppeling als klikbare verwijzing (aanvraagnummer, bedrijf, contactpersoon). Het aanvraagnummer wordt al getoond in de lijst; de detailpagina krijgt dezelfde weergave zodat overal duidelijk is aan welke aanvraag de taak hangt.

## Technische details
- `src/pages/TasksPage.tsx`: formulierstate uitbreiden met `linkType` ('inquiry' | 'company' | 'contact') en `inquiryId`; nieuwe `CrmCombobox` met aanvraagopties, gefilterd op `inquiry.companyId` als er een bedrijf gekozen is (via `useInquiriesContext`, al geïmporteerd). Bij selectie van een aanvraag `companyId`/`contactId` afleiden uit de aanvraag. `addTask` krijgt `inquiryId` mee.
- `src/components/detail/TasksSection.tsx`: `defaults.inquiryId` blijft leidend; bedrijf/contact van de aanvraag als fallback meesturen.
- `src/pages/TaskDetailPage.tsx`: gekoppelde aanvraag tonen/wijzigen met dezelfde comboboxen.
- Geen databasewijziging nodig: `tasks.inquiry_id`, `company_id` en `contact_id` bestaan al.
