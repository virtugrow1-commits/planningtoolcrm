# Klantenkaart per bedrijf

De bedrijfspagina wordt één duidelijke klantenkaart. Alles wat bij die klant hoort staat er in vaste blokken, met steeds de aanvraag als rode draad.

## Nieuwe indeling van de klantenkaart

Links (blijft staan):
- NAW-gegevens van het bedrijf, met een vinkje **Particulier**
- Bij een particulier: naam + verjaardag van de persoon, in dd-mm-jjjj

Rechts, in deze volgorde:
1. **Contactpersonen** — naam, functie, DMU, functiegroep; personen die uit dienst zijn onderaan met het label "Uit dienst"
2. **Gespreksverslagen** — één tijdlijn van alle verslagen van de klant, met de naam van de contactpersoon per verslag, nieuw verslag toevoegen vanaf de kaart
3. **Aanvragen** — de lopende aanvragen
4. **Opties** — elke optie met de naam van de aanvraag eronder als aanklikbare regel
5. **Taken** — elke taak met de naam van de aanvraag eronder als aanklikbare regel, of zonder als de taak niet aan een aanvraag hangt
6. **Eerdere aanvragen** — afgeronde en verloren aanvragen, ingeklapt

Weg van de kaart: de losse blokken "Reserveringen" en de historie met komende/eerdere reserveringen. Reserveringen blijf je zien via de aanvraag en de agenda.

## Koppelingsregels die we vastleggen

- Een aanvraag hangt altijd aan een bedrijf; bij een particulier is de persoon zelf de "klant".
- Een contactpersoon hangt altijd aan een bedrijf.
- Een aanvraag hangt altijd aan een contactpersoon.
- Een reservering hangt altijd aan een aanvraag.
- Een optie hangt aan een aanvraag of aan een contactpersoon.
- Een taak hangt aan een aanvraag of aan een contactpersoon.

Waar bestaande gegevens die koppeling missen, vullen we die eenmalig aan op basis van de al aanwezige contactpersoon of het bedrijf. Bij twijfel laten we de koppeling leeg in plaats van te gokken; die gevallen blijven zichtbaar op de kaart zonder subtitel.

## Uit dienst

Meld je een contactpersoon uit dienst, dan blijft alles bij de oude werkgever staan:
- Zijn gespreksverslagen, aanvragen, opties en reserveringen blijven op de klantenkaart van de oude werkgever, onder het label "Uit dienst".
- Koppel je hem daarna aan een nieuwe werkgever, dan start hij daar leeg: alleen wat vanaf dat moment nieuw is, komt op de nieuwe klantenkaart.

## Particulier en verjaardag

- Vinkje **Particulier** op de klantenkaart.
- Staat dat vinkje aan, dan tonen we op de kaart naam + verjaardag van de persoon. De verjaardag komt uit het bestaande geboortedatumveld van de contactpersoon, dus je vult hem één keer in.
- Bij particulieren verbergen we velden die er niet horen (KvK, btw-nummer).

## Technische uitwerking

Database (één migratie):
- `companies.is_private boolean not null default false`
- `contact_activities.company_id uuid references companies(id)` — gevuld bij aanmaken met de werkgever van de contactpersoon op dat moment; eenmalige backfill vanuit de huidige `contacts.company_id`
- `contact_companies.departed_at timestamptz` — gezet bij uit dienst melden, zodat de oude werkgever het bezit houdt
- Backfill: `inquiries.company_id` en `bookings.company_id`/`inquiry_id` aanvullen waar eenduidig af te leiden via de contactpersoon; geen gegevens verwijderen

Front-end:
- `src/pages/CompanyDetailPage.tsx`: blokken herordenen, "Reserveringen" en `HistorySection` verwijderen, blokken "Gespreksverslagen" en "Eerdere aanvragen" toevoegen, particulier-vinkje + verjaardagregel
- Nieuw `src/components/detail/CompanyCallLogTimeline.tsx`: samengevoegde verslagen van alle (ook uit dienst) contactpersonen van het bedrijf, hergebruikt `CallLogPanel`-logica
- `TasksSection` en de optieregels krijgen een subtitel met aanvraagnaam plus link naar `/inquiries/:id`
- `src/hooks/useContactActivities.ts`: `company_id` meeschrijven en filteren op bedrijf
- Uit dienst melden in `ContactDetailPage`/`CompanyDetailPage` zet `departed_at` op de bedrijfskoppeling en laat `contacts.company_id` los bij overstap
- Selectie op de kaart bepaalt eigendom: verslagen/aanvragen/opties horen bij het bedrijf via hun eigen `company_id`, niet meer via de huidige werkgever van de contactpersoon

Bestaande GHL-synchronisatie en de taak-reserveringkoppeling blijven ongewijzigd.
