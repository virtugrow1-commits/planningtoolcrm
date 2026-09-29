# CRM Aan de Donge: uitbreiding klantkaart, aanvragen, taken en pipeline

Het werk bouwt verder op wat er al is: de klantenkaart per bedrijf, het vinkje Particulier, de koppeling tussen reservering en aanvraag, de pipeline met de huidige statussen en de GHL-koppeling. Er wordt niets opnieuw gebouwd en er wordt geen data verwijderd. Alles gebeurt in de draft **CRM 2.0 klanttest**. Er wordt niets gepubliceerd.

## Wat er verandert (in 4 fases)

### Fase 1: Klantkaart en nieuwe klant
- De klantkaart krijgt deze tabs: **Overzicht, Contactpersonen, Taken, Aanvragen, Toekomstige reserveringen, Afgeronde reserveringen**.
- Het overzicht toont:
  - de NAW-gegevens
  - het type klant (Bedrijf of Particulier)
  - de algemene telefoon, e-mail en website
  - de notities
  - de hoofdcontactpersoon
- Bovenaan staan klikbare cijfers: open aanvragen, toekomstige reserveringen, afgeronde reserveringen en open taken.
- De knop **Nieuwe klant** vraagt eerst: Bedrijf of Particulier. Daarna volgt het juiste formulier. Bij een bedrijf maak je direct daarna de eerste contactpersoon aan. Bij een particulier is geen bedrijfsnaam nodig.
- Een reservering is **toekomstig** als de datum vandaag of later is en de reservering niet geannuleerd is. Al het andere valt onder **afgerond**.

### Fase 2: Contactpersonen per aanvraag
- Contactpersonen krijgen er deze velden bij:
  - tussenvoegsel
  - mobiel nummer (naast telefoon)
  - hoofdcontactpersoon ja/nee
  - actief ja/nee (de bestaande "Uit dienst" blijft werken)
- Een aanvraag krijgt een eigen lijst contactpersonen. Je kiest die uit de contactpersonen van het bedrijf, met één primaire contactpersoon. Er worden geen contactgegevens gekopieerd.
- Op de aanvraag staat de knop **Contactpersoon toevoegen aan aanvraag**. Je kiest een bestaande contactpersoon of maakt er direct een nieuwe aan.
- Van de primaire contactpersoon zie je naam, e-mail, mobiel en geboortedatum (dd-mm-jjjj). E-mail en telefoon zijn klikbaar.
- Bestaande aanvragen krijgen hun huidige contactpersoon eenmalig als primaire contactpersoon.

### Fase 3: Aanvraagdetail, pipeline en geschiedenis
- De aanvraagpagina krijgt de tabs **Overzicht, Contactpersonen, Taken, Notities, Reservering, Geschiedenis**.
- Bovenaan staan bedrijf, nummer, titel, status, eventdatum en aantal personen.
- Nieuwe velden op de aanvraag:
  - titel
  - verwachte waarde (het bestaande budget)
  - datum laatste contact
  - datum volgende actie
- Het aanvraagnummer blijft zoals het nu is, zodat de koppeling met GHL en offertes niet breekt. Zie de vraag onderaan.
- De pipelinekaarten tonen:
  - de klant
  - de titel
  - de eventdatum
  - het aantal personen
  - de primaire contactpersoon
  - de verantwoordelijke
  - de volgende taak
  - de waarde
  - de status
- De huidige statussen blijven precies zoals ze zijn. De kolommen worden gegroepeerd in Aanvraag, Sales, Reservering en Aftersales.
- Een aanvraag kan niet meer zonder klant worden aangemaakt. Vanaf een klantkaart vult de klant zichzelf in. Vanuit het menu zoek je de klant op of klik je op **Nieuwe klant aanmaken**.
- De geschiedenis per aanvraag toont datum, tijd, medewerker en actie. Dit wordt vastgelegd:
  - aanvraag aangemaakt
  - status gewijzigd
  - contactpersoon toegevoegd of verwijderd
  - taak aangemaakt of afgerond
  - reservering aangemaakt of gewijzigd
  - notitie toegevoegd

### Fase 4: Taken
- Er zijn twee soorten taken:
  - **Algemene klanttaak:** zichtbaar op de klantkaart.
  - **Aanvraagtaak:** alleen zichtbaar bij die ene aanvraag.
- Bestaande taken met een aanvraag worden aanvraagtaken. Alle andere taken worden algemene klanttaken.
- Je zoekt op titel, omschrijving, bedrijf, klant, contactpersoon, eventnaam, aanvraagnummer, aanvraagtitel en verantwoordelijke. Hoofdletters en accenten maken daarbij niet uit ("jansen" vindt ook "Jansén").
- Filters:
  - status: open, afgerond of te laat
  - type
  - verantwoordelijke
  - periode: vandaag, deze week, volgende week, deze maand of zelf kiezen
  - klanttype
  - aanvraag
  - event
- Met **Filters wissen** zet je alle filters in één keer uit.
- Dezelfde zoeklogica komt ook op de pagina's voor klanten, contactpersonen en aanvragen.

### Voor alle fases
- Controles bij het invullen:
  - e-mailadres in een geldig formaat
  - Nederlandse en internationale telefoonnummers
  - geen geboortedatum in de toekomst
  - aantal personen 0 of meer
  - bij een bedrijf is de naam verplicht, bij een particulier voor- en achternaam
- Elk onderdeel toont duidelijk dat het laadt, dat er niets is ("Geen contactpersoon gekoppeld") of dat er iets misging. Je ziet nooit "undefined" of "null".
- Voor verwijderen vraagt het systeem eerst om bevestiging.
- Na afloop worden de 7 testscenario's uit de opdracht in de preview doorlopen, op desktop en mobiel. Daarna worden de testgegevens opgeruimd.

## Buiten deze opdracht
- Rechten per rol (bekijken, wijzigen, verwijderen). Nu mag elke ingelogde collega van de organisatie alles. Dit kan in een aparte stap.
- Instelbare pipelinefases in de instellingen. De structuur wordt wel zo gebouwd dat dit later kan.

## Technische uitwerking
- Migraties zijn altijd aanvullend. Er wordt niets hernoemd of verwijderd.
  - `contacts`: `infix`, `mobile`, `is_primary`, `is_active` (standaard `not departed`)
  - `inquiries`: `title`, `last_contact_at`, `next_action_at`, `deleted_at`. `budget` wordt gebruikt als waarde.
  - `tasks`: `task_scope text check in ('customer','request')`. Eenmalige backfill op basis van `inquiry_id`.
  - Nieuwe tabel `inquiry_contacts` (id, inquiry_id, contact_id, role, is_primary, user_id, created_at): uniek op (inquiry_id, contact_id), één primaire per aanvraag via een partial unique index, met GRANT's en RLS zoals de andere tabellen. Backfill vanuit `inquiries.contact_id`.
  - Nieuwe tabel `inquiry_history` (inquiry_id, user_id, actor_name, action, details jsonb, created_at). Wordt gevuld door triggers op `inquiries` (insert en statuswijziging), `inquiry_contacts`, `tasks` en `bookings`, en door notities in de app.
  - `unaccent`-extensie plus een `normalize_search()`-functie voor zoeken aan de databasekant.
- Front-end:
  - `src/lib/search.ts` met `normalizeSearch()` (NFD, accenten weg, lowercase), gebruikt in alle lijsten
  - `CompanyDetailPage` wordt omgebouwd naar tabs
  - nieuwe `NewCustomerDialog` met keuze Bedrijf of Particulier
  - nieuwe `InquiryContactsTab` en `AddInquiryContactDialog`
  - `InquiryDetailPage` krijgt tabs
  - de pipelinekaart in `InquiriesPage` wordt uitgebreid
  - `NewInquiryDialog` krijgt een verplichte klant plus inline nieuwe klant
  - `TasksPage` krijgt de filters en de scope
- GHL:
  - `contacts.phone` blijft het veld dat met GHL synchroniseert
  - `mobile` blijft alleen lokaal, tenzij GHL al een mobiel veld levert (dat wordt gecontroleerd vóór fase 2)
  - `inquiries.contact_id` blijft de primaire contactpersoon, zodat de sync blijft werken
