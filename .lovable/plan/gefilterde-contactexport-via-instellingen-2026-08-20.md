# Gefilterde contactexport via Instellingen

Nu kan er alleen vanuit CRM een export worden gemaakt van de lijst zoals die op dat moment gefilterd is (status en bedrijf). Filteren op tag — bijvoorbeeld "Vrienden aan de Donge" — is daar niet mogelijk. We voegen daarom een eigen exportonderdeel toe in Instellingen.

## Wat je krijgt

Een nieuw tabblad **Export** in Instellingen met:

- Keuze **tags**: multi-select met de bestaande GHL-tags (zelfde lijst als bij contactpersonen, dus geen vrije invoer).
- Keuze of een contact **alle** gekozen tags moet hebben of **minstens één** (standaard: minstens één).
- Extra filters: status (lead/prospect/klant/…), bedrijf, en een schakelaar "contactpersonen uit dienst meenemen" (standaard uit).
- Live teller: "142 contactpersonen komen overeen" voordat je exporteert.
- Kolomkeuze via vinkjes (naam, e-mail, telefoon, bedrijf, functie, afdeling, DMU, functiegroep, adres/postcode/plaats/land, geboortedatum, status, tags) met een verstandige standaardselectie.
- Knop **Exporteren als CSV** die een bestand downloadt met naam op basis van de filter, bijv. `contacten-vrienden-aan-de-donge-20-08-2026.csv`.

Als er geen enkel contact matcht, blijft de knop uit met een duidelijke melding.

## Technisch

- Nieuw component `src/components/settings/ContactExportPanel.tsx`.
- Data: bestaande `useContactsContext()` (bevat al `tags`, `departed` en alle CRM-velden) en `useGhlTags()` voor de tagdropdown. Geen nieuwe queries of database-wijzigingen nodig.
- Export via het bestaande `exportToCSV` in `src/lib/csvExport.ts` (UTF-8 BOM blijft behouden voor Excel).
- `src/pages/SettingsPage.tsx`: extra `TabsTrigger`/`TabsContent` met waarde `export` (icoon `Download`), tussen "Veld Mapping" en "CSV Import".
- Filterlogica puur client-side in een `useMemo`; tags vergeleken case-insensitive en met trim, zodat kleine schrijfverschillen in GHL geen contacten missen.
- Datums in de export volgen het bestaande `formatDate` (dd-MM-yyyy).
