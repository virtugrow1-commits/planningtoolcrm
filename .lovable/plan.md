# CRM 2.0 — moderner, rustiger en sneller

Zelfde huisstijl: warm bruin, goud accent, dezelfde fonts. Geen nieuwe kleuren, alleen betere opbouw, rust en snelheid.

## 1. Menubalk opschonen

Nieuwe balk: **Dashboard · Taken · CRM · Aanvragen · Kalender** (plus rechts taal, instellingen, sync en account).

- Documenten en Reserveringen verdwijnen uit de balk. De pagina's blijven werken en zijn bereikbaar via een bedrijf, een aanvraag of een reservering in de kalender.
- Aanvragen houdt het rode telletje voor ongelezen aanvragen.

## 2. Nieuwe paginakop op elke lijstpagina

Eén vaste opbouw voor CRM, Aanvragen, Taken, Documenten en Reserveringen:

```text
Titel + korte uitleg                    [ hoofdactie ]
Zoekveld ......................  filters   weergave
--------------------------------------------------
inhoud
```

- Zoeken en filters staan altijd op dezelfde plek en blijven bovenaan staan bij scrollen.
- Actieve filters worden als klikbare chips getoond, met "wissen".
- Rijen worden compacter en beter leesbaar; statussen krijgen één consistente stijl (dezelfde kleuren als nu).
- Lege lijsten krijgen een vriendelijke tekst met de knop die je dan nodig hebt.

## 3. Rustiger uiterlijk

- Zachtere kaarten, iets minder schaduw, meer lucht tussen blokken.
- Eén set statuslabels en knopstijlen door het hele systeem.
- Tabellen: vaste kolomkoppen bij scrollen, duidelijke hover, rij is helemaal klikbaar.
- Mobiel: lijsten worden kaartjes in plaats van smalle tabellen.

## 4. Sneller laden

- Documenten, offertes, facturen, gespreksverslagen en de sync-wachtrij halen nu álle kolommen op. Dat wordt beperkt tot de kolommen die de pagina echt toont.
- Zware pagina's (offerte-editor, PDF-editor, kalender, instellingen) worden pas geladen als je ze opent, zodat het eerste scherm sneller staat.
- Lijstpagina's tonen skeletblokken per onderdeel in plaats van één lange laadbalk.
- Lijsten met veel rijen (contacten, bedrijven, taken) tonen alleen wat in beeld is, zodat scrollen soepel blijft.
- Zoeken wordt vertraagd verwerkt (debounce), zodat typen niet meer stottert.

## 5. Nog open uit het vorige bericht (klantenkaart)

- Gespreksverslagen slaan nu wel het bedrijf op, maar de lijst van verslagen leest dat veld nog niet overal mee. Dit wordt afgemaakt zodat een verslag bij de oude werkgever blijft staan, ook nadat iemand uit dienst is.
- Op de klantenkaart worden aanvragen nu deels gekoppeld via de huidige contactpersonen. Daardoor kan een aanvraag van een nieuwe werkgever nog op de oude kaart opduiken. Dit wordt gefilterd op de werkgeverperiode.
- Bij opnieuw in dienst treden bij hetzelfde bedrijf wordt de "uit dienst"-datum weer leeggemaakt.
- De 9 bestaande beveiligingswaarschuwingen in de database (van vóór deze wijzigingen) worden apart nagekeken en gemeld, niet blind aangepast.

## Technisch

- `AppLayout.tsx`: `navItemDefs` terug naar 5 items; routes voor `/documents` en `/reserveringen` blijven in `App.tsx`.
- Nieuwe herbruikbare componenten: `PageHeader`, `FilterBar` (chips + reset), `DataTable`-wrapper met sticky head en virtualisatie, `ListSkeleton`.
- Design tokens in `index.css` uitbreiden met kaart-/oppervlaktetokens en zachtere shadow-variabelen; geen hardcoded kleuren in componenten.
- Kolomselectie i.p.v. `select('*')` in `useDocuments`, `useQuotes`, `useInvoices`, `useContactActivities`, `useQuoteTemplates`, `useSyncQueue`, `ConversationsPage`.
- `React.lazy` + `Suspense` voor `NewQuotePage`, `QuoteDetailPage`, `TemplateEditorPage`, `pdf-editor`, `SettingsPage`, `CalendarPage`.
- `useContactActivities`: `company_id` toevoegen aan type, select, mapping en insert.
- `useContactCompanies`: `departed_at` resetten bij herkoppeling; klantenkaart filtert aanvragen/verslagen op werkgeverperiode.
- Typecheck (`tsgo --noEmit`) na elke fase; visuele controle via browser op de belangrijkste pagina's.
