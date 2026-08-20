# Export netjes in losse kolommen

Het exportbestand is technisch correct, maar Excel in Nederlandse instelling verwacht een puntkomma (`;`) als scheidingsteken in plaats van een komma. Daarom belandt elke regel in één kolom.

## Wat je krijgt

- De CSV-export gebruikt een puntkomma als scheidingsteken, zodat Excel voornaam, achternaam, e-mail, telefoon enz. automatisch in aparte kolommen zet — dubbelklikken is genoeg, geen importwizard meer.
- Blijft werken zoals nu: UTF-8 met BOM (accenten goed), tags gescheiden door `;` binnen één cel worden veilig gequoteerd zodat ze de kolommen niet breken.
- Telefoonnummers en postcodes blijven leesbaar staan zoals ze zijn.

## Technisch

- `src/lib/csvExport.ts`: scheidingsteken configureerbaar maken met standaard `;`, en de `escapeCSV`-check uitbreiden naar het gebruikte scheidingsteken (nu wordt alleen op `,` gecontroleerd, waardoor een tag-veld met `;` de kolommen zou breken).
- Eerste regel van het bestand wordt `sep=;` zodat Excel het scheidingsteken expliciet overneemt, ongeacht regio-instelling.
- Tags binnen één cel scheiden met een komma + spatie in `ContactExportPanel.tsx`, zodat ze niet met het kolomscheidingsteken conflicteren.
- Geen wijzigingen aan filters, kolomkeuze of database.
