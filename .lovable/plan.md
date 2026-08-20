# Export in kolommen + keuze CSV / Excel / PDF

Het exportbestand is technisch correct, maar Excel in Nederlandse instelling verwacht een puntkomma (`;`) als scheidingsteken in plaats van een komma. Daarom belandt alles in één kolom. We lossen dat op én voegen een keuze van bestandsformaat toe.

## Wat je krijgt

In het tabblad Export een keuze **Bestandsformaat**: Excel (.xlsx), CSV (.csv) of PDF (.pdf). De knop past mee: "Exporteren als Excel / CSV / PDF".

- **Excel (.xlsx)** — standaardkeuze. Echte kolommen, vetgedrukte kopregel, bevroren bovenste rij, automatische kolombreedtes en een autofilter. Telefoonnummers en postcodes blijven als tekst staan (geen verminkte nullen).
- **CSV (.csv)** — nu met puntkomma als scheidingsteken, zodat Excel de kolommen direct goed splitst bij dubbelklikken. UTF-8 met BOM blijft behouden voor accenten.
- **PDF (.pdf)** — nette tabel in liggende A4 met titel, gekozen filters (bijv. tag "Vrienden aan de Donge"), datum, aantal contactpersonen en paginanummers. Bedoeld om te printen of te delen; bij veel kolommen wordt de tekst kleiner zodat alles op de pagina past.

Filters, kolomkeuze, de matchteller en de bestandsnaam werken precies zoals nu — alleen de extensie verschilt.

## Technisch

- `src/lib/csvExport.ts`: scheidingsteken configureerbaar met standaard `;`, en `escapeCSV` controleert op het gebruikte scheidingsteken (nu alleen op `,`, waardoor een tag-cel met `;` de kolommen zou breken).
- Nieuw `src/lib/xlsxExport.ts` met een `exportToXLSX(rows, columns, filename)` op basis van `xlsx` (SheetJS), inclusief kolombreedtes, freeze pane en autofilter; tekstvelden geforceerd als string.
- Nieuw `src/lib/pdfExport.ts` met `exportToPDF(rows, columns, filename, meta)` op basis van `jspdf` + `jspdf-autotable`, liggende A4, merkkleuren uit de bestaande tokens (bruin/goud), header/footer met filterbeschrijving en paginanummering.
- `ContactExportPanel.tsx`: extra `Select` voor formaat (`xlsx` | `csv` | `pdf`), `handleExport` routeert naar de juiste helper; tags binnen één cel gescheiden met komma + spatie zodat ze niet met het CSV-scheidingsteken botsen.
- Benodigde packages: `xlsx`, `jspdf`, `jspdf-autotable`. Geen database- of backendwijzigingen.
