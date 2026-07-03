## Probleem
Op de **bedrijfsdetailpagina** (`/companies/:id`) ontbreekt een verwijderknop. Op de overzichtspagina `/companies` bestaat al een prullenbak-icoon per rij, maar zodra je een bedrijf opent kun je hem niet meer verwijderen — vandaar dat "Test bedrijf BV" lastig weg te krijgen is.

## Oplossing
Een **"Verwijderen"-knop** toevoegen in de header van `CompanyDetailPage.tsx` met bevestigingsdialoog.

### Gedrag
- Rode knop rechtsboven naast de bestaande acties (bijv. "Bewerken")
- Klik → `AlertDialog` "Weet je zeker dat je *[bedrijfsnaam]* wilt verwijderen?"
- Bij bevestiging: `deleteCompany(id)` uit `useCompaniesContext()` aanroepen, toast tonen en terug navigeren naar `/companies`
- Bijhorende contacten worden **niet** automatisch verwijderd; hun `company_id` wordt losgekoppeld (zoals de bestaande delete al doet). Als je wilt dat contacten óók verdwijnen, laat het weten.

### Extra check
Ook op de overzichtspagina blijft de prullenbak per rij + bulk-verwijderen werken zoals nu.

### Bestanden
- `src/pages/CompanyDetailPage.tsx` — knop + AlertDialog + delete handler toevoegen
