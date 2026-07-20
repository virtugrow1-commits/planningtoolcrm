## Probleem

Op de aanvraag-detailpagina open je "Maak optie" → het optie-dialoog krijgt zowel `contactId` als `companyId` van de aanvraag mee. Het dialoog filtert vervolgens de contactenlijst strikt op "hoort bij dit bedrijf" (via `contact.company_id`, de junction-tabel, of exacte bedrijfsnaam). Staat de contactpersoon *niet* aan dat bedrijf gekoppeld (bv. GHL-import zonder company link, of ander bedrijf), dan:

1. De contact valt uit `filteredContacts` en verschijnt niet in de dropdown.
2. Een tweede effect (`Auto-reset contact when company changes`) wist zelfs de vooraf-ingevulde contactpersoon en toont de toast "Contact gewist".

Vanuit de kalender is er geen bedrijf voorgeselecteerd, dus alle contacten zijn zichtbaar — daar werkt het wel.

## Oplossing

`src/components/calendar/NewReservationDialog.tsx` aanpassen zodat een expliciet gekozen/prefilled contact altijd zichtbaar en behouden blijft, zelfs als de koppeling met het bedrijf ontbreekt:

1. `prefill?.contactId` als prop opvangen als "altijd toegestaan id".
2. `contactMatchesCompany`: ook `true` teruggeven voor `c.id === form.contactId` (de op dit moment geselecteerde contactpersoon) — zo blijft de aanvraagcontact altijd in de dropdown staan.
3. Auto-reset-effect (regels 206–214): overslaan wanneer het contact gelijk is aan de initiële `prefill.contactId` — geen ongewenste "Contact gewist"-toast meer bij het openen van de optie-flow vanuit een aanvraag.
4. Als de gekozen contactpersoon niet bij het bedrijf hoort, een kleine info-hint tonen ("Contact is niet gekoppeld aan dit bedrijf") in plaats van hem te verbergen.

Geen wijzigingen aan database, edge-functies of andere schermen.

## Verificatie

- Open een aanvraag waarvan de contact niet aan een bedrijf hangt → klik "Maak optie" → contactnaam blijft ingevuld en zichtbaar in de dropdown, geen "Contact gewist"-toast.
- Kalender-flow ongewijzigd: alle contacten blijven zichtbaar zonder bedrijf, filter werkt als bedrijf gekozen wordt.
