# Afronden CRM 2.0 — de laatste punten

Goede vraag: er staan nog een paar dingen open uit het goedgekeurde CRM 2.0-plan. Dit is wat er nog mist.

## 1. Dezelfde nieuwe paginakop overal

Nu hebben alleen CRM en Reserveringen de nieuwe kop. Nog te doen op:

- Taken
- Aanvragen (pipeline)
- Documenten
- Bedrijven

Elke pagina krijgt: titel, korte samenvatting met aantallen, de knoppen rechtsboven, en zoeken/filters in de balk die blijft staan bij scrollen.

## 2. Placeholder-rijen tijdens laden

Nu alleen op CRM, Taken en Reserveringen. Nog toevoegen op:

- Dashboard
- Aanvragen
- Documenten
- Bedrijfspagina (klantenkaart) en contactpagina — per blok, zodat de pagina niet in één keer leeg blijft

## 3. Lijsten met vaste kolomkoppen

Aanvragenlijst, documenten en bedrijven krijgen dezelfde meelopende kolomkoppen en scrollbare lijst als CRM en Reserveringen.

## 4. Kleine opruiming en laadwinst

- Ongebruikte menu-iconen uit de navigatiecode halen (opgeruimde code, geen zichtbaar verschil).
- Gesprekken, sjablonen en de synchronisatie-wachtrij halen nog alle velden op; die beperken tot wat op het scherm staat.
- Detailpagina's blijven bewust alle velden ophalen — daar is het nodig.

## 5. Controle achteraf

- Typecheck over het hele project.
- Bedrijfspagina en contactpagina in de browser nalopen op de vier belangrijkste punten: contactpersonen, gespreksverslagen, taken met aanvraagnaam en opties.

## Technische details

- `PageHeader` en `ListSkeleton` worden hergebruikt in `TasksPage.tsx`, `InquiriesPage.tsx`, `QuotesPage.tsx`, `CompaniesPage.tsx`, `ReserveringenPage.tsx`, `Dashboard.tsx`, `CompanyDetailPage.tsx`, `ContactDetailPage.tsx`.
- `.page-toolbar` en `.sticky-head` (al aanwezig in `index.css`) worden op de resterende lijsten toegepast; geen nieuwe kleuren of fonts.
- Expliciete kolommen in `ConversationsPage.tsx`, `useQuoteTemplates.ts`, `useSyncQueue.ts`; `select('*')` in detail-fetches van `useQuotes.ts` en `useInvoices.ts` blijft staan.
- Ongebruikte icon-imports in `AppLayout.tsx` verwijderen.
- Afsluiten met `bunx tsgo --noEmit` en een browsercontrole van de klantenkaart.

## Buiten scope

- De 9 databasemeldingen: die horen bij de openbare offertepagina en moeten publiek blijven.
- Geen wijzigingen in huisstijl, kleuren of bestaande werking.
