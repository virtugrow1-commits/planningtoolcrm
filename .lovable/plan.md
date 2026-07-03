## Probleem

Bij het aanmaken van een optie/reservering vanuit een aanvraag-tegel (`NewReservationDialog`) filtert het contact-veld op `contact.companyId === form.companyId`. Veel contacten hebben echter alleen een link via de `contact_companies`-junctietabel of enkel een `company`-naamveld — die verdwijnen daardoor uit de lijst zodra je een bedrijf kiest, waardoor de dropdown leeg lijkt.

## Oplossing

In `src/components/calendar/NewReservationDialog.tsx` de `filteredContacts` uitbreiden zodat een contact zichtbaar is wanneer één van deze condities klopt met het gekozen bedrijf:

1. `contact.companyId === form.companyId` (huidige regel), of
2. Het contact staat in `contact_companies` gekoppeld aan `form.companyId` (via `useContactCompanies().getCompanyContacts(companyId)`), of
3. `contact.company` (tekst) komt hoofdletter-ongevoelig overeen met `selectedCompany.name`.

Zo blijven ook contacten die alleen via de junctietabel of via naam gekoppeld zijn selecteerbaar.

## Technische details

- Import `useContactCompanies` in `NewReservationDialog.tsx`.
- Bouw een set van contact-id's voor het gekozen bedrijf: `new Set(getCompanyContacts(form.companyId).map(x => x.contact_id))`.
- `filteredContacts` memoiseren op basis van `contacts`, `form.companyId`, deze set en `selectedCompany?.name`.
- Overige logica (auto-reset bij mismatch in useEffect regel 191–198) verruimen met dezelfde drie-weg check zodat een geldig gekoppeld contact niet ten onrechte gewist wordt.

## Buiten scope

- Geen wijzigingen in andere dialogen, contexten of de database.
- Geen aanpassing aan hoe contacten aan bedrijven gekoppeld worden.
