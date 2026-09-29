# Particulieren apart tonen in het CRM

## Wat je gaat zien
1. **Nieuw tabblad "Particulieren"** in het CRM, naast Contactpersonen en Bedrijven.
   - Toont alle klanten die als Particulier zijn aangemaakt: naam, e-mail, mobiel, verjaardag (dd-MM-jjjj), plaats.
   - Eigen zoekbalk, sorteren en klikbaar naar de klantkaart.
   - Knop "Nieuwe particulier" die het klantformulier opent met Particulier al gekozen.
2. **Tabblad "Bedrijven" toont alleen nog echte bedrijven** (particulieren verdwijnen daaruit). Tellers per tabblad kloppen daardoor.
3. **Contactpersonen-lijst**: bij een particulier staat in de kolom "Bedrijf" niet meer de naam, maar een klein label "Particulier" en verder leeg.
4. **Contactpersoonkaart en aanvraag/pipelinekaart**: het veld heet bij een particulier "Klanttype: Particulier" in plaats van "Bedrijf: <naam>". Het bedrijfsveld blijft leeg.
5. **Klantkaart van een particulier**: kop toont "Particulier" i.p.v. "Bedrijf", zonder KvK/BTW/website-velden.

## Waarom deze aanpak
Een apart tabblad plus label is het duidelijkst: bedrijven en particulieren raken niet gemengd, en er hoeft niets aan de koppelingen of GHL-sync te veranderen (particulieren blijven intern als klant bestaan, zodat aanvragen, reserveringen en taken gewoon blijven werken).

## Technisch
- `CrmPage.tsx`: CrmTab uitbreiden met `'private'`; `filteredCompanies` filteren op `!isPrivate`, nieuwe lijst voor `isPrivate`; contactrij toont badge als gekoppeld bedrijf `isPrivate`.
- `ContactDetailPage.tsx` (CompanyField), `InquiriesPage.tsx` pipelinekaart, `CompanyDetailPage.tsx`: label/weergave afhankelijk van `isPrivate`.
- Bedrijfsfilter-dropdowns sluiten particulieren uit.
- Geen databasewijziging; `companies.is_private` bestaat al.
