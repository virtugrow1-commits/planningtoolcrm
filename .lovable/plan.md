# Sneller laden van de app

## Wat er nu gebeurt

Bij elke keer dat de app opent, haalt hij eerst *alle* gegevens op voordat er iets in beeld komt:

- 1.382 contactpersonen
- 1.262 bedrijven
- 432 aanvragen
- 272 reserveringen
- 3.576 taken
- plus offertes en facturen

Alles wordt volledig opgehaald (alle kolommen), pagina na pagina, netjes achter elkaar in plaats van tegelijk. Het dashboard wacht tot de laatste lijst binnen is en toont tot die tijd alleen "Laden...". Daarnaast wordt bij elke wijziging in de database de hele lijst opnieuw opgehaald.

## Wat we gaan doen

1. **Alles tegelijk ophalen in plaats van na elkaar.** De lijsten worden parallel opgevraagd, en per lijst worden de pagina's ook parallel opgehaald in plaats van één voor één.
2. **Alleen ophalen wat nodig is.** Per lijst alleen de velden die de schermen echt gebruiken, in plaats van alle kolommen. Detailpagina's halen hun eigen extra gegevens op wanneer ze geopend worden.
3. **Direct iets tonen.** Het dashboard wacht niet meer op de laatste lijst: elk blok toont zijn eigen laad-skelet en vult zich zodra zijn gegevens binnen zijn. De navigatie en de pagina-indeling verschijnen meteen.
4. **Taken slimmer laden.** Taken zijn met bijna 3.600 stuks de zwaarste lijst. Standaard laden we de openstaande en recent afgeronde taken; oudere afgeronde taken worden pas geladen als iemand daarop filtert of zoekt.
5. **Live-updates afremmen.** Een wijziging in de database triggert nu direct een volledige herlading, ook meerdere keren achter elkaar tijdens een synchronisatie. Dat wordt samengevoegd tot één herlading (kort uitstel), zodat de app niet blijft bonken tijdens een GHL-sync.

Er verandert niets aan de inhoud van de schermen, aan de logica van reserveringen/aanvragen of aan de synchronisatie met GHL — alleen aan wanneer en hoe de gegevens geladen worden.

## Technische details

- `ContactsContext`, `CompaniesContext`, `InquiriesContext`, `BookingsContext`, `TasksContext`: expliciete kolomlijsten i.p.v. `select('*')`; eerste pagina ophalen met `count: 'exact'` (head-loos) en de resterende pagina's via `Promise.all` op basis van de count, i.p.v. de huidige `while`-lus.
- Providers blijven genest, maar renderen hun children direct; geen enkele provider blokkeert de boom.
- `Dashboard.tsx`: de gecombineerde `loading`-gate (regel 336-341) vervalt; per sectie skeleton via de bestaande `DashboardSection`/`Skeleton`-componenten.
- Realtime-handlers in alle vijf contexts krijgen een gedeelde debounce-helper (±400 ms trailing) rond `refetch`.
- Taken: default filter `status = 'open'` plus `completed` van de laatste 90 dagen; volledige set laden bij expliciet filteren/zoeken. Bestaande `addTask`/`updateTask`/`deleteTask`-paden en GHL-sync blijven ongewijzigd.
- Geen databasewijzigingen nodig; als na de meting nog een lijst traag blijft, aparte stap voor gerichte indexen.
