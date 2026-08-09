# Contactpersonen zichtbaar maken bij optie aanmaken vanuit een aanvraag

## Wat er nu gebeurt

In het dialoog "Nieuwe reservering / optie" (gebruikt vanuit een aanvraag en vanuit Reserveringen) wordt de lijst met contactpersonen hard gefilterd zodra je een bedrijf kiest. Een contact wordt alleen nog getoond als:

- het contact een directe bedrijfskoppeling heeft (`company_id`), of
- er een koppeling in de koppeltabel staat, of
- de vrije tekst-bedrijfsnaam exact gelijk is aan de naam van het gekozen bedrijf.

Valt een contact buiten die drie regels, dan is de lijst leeg en zie je geen namen. Twee bevestigde oorzaken:

1. 57 contactpersonen hebben alleen een bedrijfsnaam als tekst en geen bedrijfskoppeling — die vallen weg bij de minste afwijking in de naam.
2. De koppeltabel bevat 1026 rijen, maar wordt zonder paginering opgehaald en stopt dus bij 1000 rijen. De laatste koppelingen ontbreken in de app, waardoor die contacten onzichtbaar worden bij hun bedrijf.

In de kalender werkt het wel, omdat dat pad niet dezelfde strikte filtering doorloopt.

## Wat we gaan doen

1. **Nooit meer een lege lijst**: na het kiezen van een bedrijf worden alle (niet uit-dienst) contactpersonen getoond, maar de contacten van het gekozen bedrijf staan bovenaan met een kopje "Contactpersonen van dit bedrijf", daaronder "Overige contactpersonen".
2. **Zoeken blijft werken** op naam, e-mail en bedrijfsnaam, dus je vindt de juiste persoon ook als de koppeling in het CRM nog ontbreekt.
3. **Automatisch wissen van het contact** bij het wisselen van bedrijf vervalt; in plaats daarvan blijft de bestaande, subtiele melding staan dat het contact (nog) niet aan het gekozen bedrijf gekoppeld is.
4. **Alle bedrijf-contactkoppelingen inladen** in plaats van de eerste 1000, zodat het bovenste blok compleet is.

## Technisch

- `src/components/calendar/NewReservationDialog.tsx`: `filteredContacts` vervangen door een gesorteerde lijst (bedrijfscontacten eerst) met groepslabels in de opties; het auto-reset-effect voor `contactId` verwijderen; mismatch-hint behouden.
- `src/components/CrmCombobox.tsx`: optionele groepskop per optie ondersteunen (`group`-veld) zodat de twee secties zichtbaar zijn, zonder gedrag voor bestaande gebruikers te wijzigen.
- `src/hooks/useContactCompanies.ts`: ophalen van `contact_companies` pagineren in blokken van 1000 tot alle rijen binnen zijn (zelfde patroon als `useContacts`).
- Geen wijzigingen aan database of opslagslogica; het opslaan van de optie blijft ongewijzigd.
