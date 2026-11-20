# Familie als eigen klantsoort in het CRM

## Probleem
Nu bestaan er twee soorten klantkaarten: **Bedrijf** en **Particulier**. Een familie (bijv. "Familie Boers") wordt daardoor als bedrijf aangemaakt, krijgt een bedrijfsnaam op offertes en staat tussen de echte bedrijven. Een particuliere klantkaart is bedoeld voor één persoon.

## Nieuwe structuur

```text
Bedrijf            -> contactpersonen (medewerkers)
Particulier        -> 1 persoon
Familie            -> meerdere personen (gezinsleden), 1 hoofdpersoon
```

Een familie is een particuliere klant met meerdere personen:
- Naam van de kaart: "Familie <achternaam>" (bijv. "Familie Boers").
- Personen hangen eronder zoals contactpersonen bij een bedrijf, met een rol: Hoofdpersoon, Partner, Kind, Ouder, Overig.
- Precies één hoofdpersoon: die krijgt offertes, bevestigingen en e-mails.
- Geen KvK, btw-nummer of website; wel adres (gezamenlijk gezinsadres).

## Wat je in het scherm ziet
1. **CRM-overzicht:** het tabblad "Particulieren" toont particulieren én families, met een label "Familie" en het aantal personen. Families staan niet meer tussen de bedrijven.
2. **Nieuwe klant:** keuze uit drie knoppen: Bedrijf / Particulier / Familie. Bij Familie vul je de achternaam en de hoofdpersoon in; extra gezinsleden voeg je toe op de kaart.
3. **Familiekaart:** lijst van gezinsleden met rol, knop "Gezinslid toevoegen", en één knop om de hoofdpersoon te wisselen. Aanvragen, reserveringen, taken en notities van alle gezinsleden staan samen in de tijdlijn (zoals nu bij bedrijven).
4. **Omzetten:** op een bestaande kaart kun je het soort wijzigen (bijv. "Familie Jansen" van Bedrijf naar Familie). De gekoppelde personen en aanvragen blijven staan.
5. **Contactpagina:** toont "Familie Boers (Partner)" in plaats van een bedrijfsnaam.

## Offertes en reserveringsbevestigingen
- Bij een familie wordt de bedrijfsnaam **"Particulier"** ingevuld (zoals nu bij particulieren), nooit "Familie Boers" als bedrijf.
- "Op naam van" wordt automatisch "Familie Boers" als het leeg is.
- Ontvanger blijft de hoofdpersoon.

## Bestaande gegevens opschonen
- Ik maak eerst een lijst van bestaande bedrijfskaarten die op een familie lijken (naam begint met "Familie", "Fam.", of alle contactpersonen hebben dezelfde achternaam en geen KvK/website).
- Die lijst laat ik jou zien; pas na jouw akkoord zet ik ze om naar Familie. Niets wordt automatisch omgezet.

## Synchronisatie met CliqCRM (GHL)
- GHL kent geen families; een familie blijft daar een "bedrijf" zodat koppelingen niet breken.
- In BUUT wordt het soort Familie bewaard en niet overschreven door de sync.

## Technische details
- `companies`: nieuwe kolom `client_kind text not null default 'bedrijf'` met check (`bedrijf`,`particulier`,`familie`); backfill uit `is_private` (true -> particulier). `is_private` blijft bestaan en wordt true gezet voor particulier én familie, zodat bestaande logica (bedrijfsnaam.ts, filters) blijft werken.
- `contact_companies`: nieuwe kolom `family_role text` (nullable); hoofdpersoon via bestaand `is_primary`.
- ghl-auto-sync/ghl-webhook: `client_kind` en `family_role` nooit overschrijven.
- `_shared/bedrijfsnaam.ts`: familie -> "Particulier"; stage-offerte/stage-reservering: op_naam_van fallback "Familie <naam>". Tests uitbreiden in bedrijfsnaam.test.ts en reservering.test.ts.
- UI: CompaniesContext (`clientKind`), CrmPage (tab + label), CompaniesPage (3 keuzes), CompanyDetailPage (gezinsleden + rollen), ContactDetailPage, NewInquiryDialog / NewReservationDialog (familie kiesbaar).
- Deploy daarna stage-offerte, stage-reservering, ghl-auto-sync, ghl-webhook. Niet publiceren.
