# Taakomschrijvingen opschonen

## Doel
Taakomschrijvingen tonen en bewaren als gewone leesbare tekst, zonder zichtbare HTML zoals `<p style="…">`.

## Gecontroleerde situatie
- Er staan nu **39 taken** met HTML in de omschrijving; de getoonde taak is daar één van.
- De HTML komt mee vanuit CliqCRM en wordt momenteel ongewijzigd opgeslagen.
- Zowel de handmatige takensynchronisatie als de automatische synchronisatie gebruikt deze onbewerkte omschrijving.
- De taakdetailpagina toont de opgeslagen waarde letterlijk, waardoor de tags en opmaakcode zichtbaar zijn.

## Uitvoering
1. Een centrale opschoonfunctie toevoegen die HTML-tags verwijdert, normale regeleinden behoudt, HTML-tekens omzet en overtollige witruimte opruimt.
2. Deze opschoning toepassen bij beide synchronisatieroutes vanuit CliqCRM, zodat nieuwe en bijgewerkte taken voortaan schone tekst krijgen.
3. Ook handmatig aangemaakte en bewerkte taakomschrijvingen vóór opslag normaliseren.
4. De 39 bestaande taakomschrijvingen eenmalig in de database opschonen, zonder de inhoudelijke tekst, koppelingen of taakstatus te wijzigen.
5. De taakdetailpagina defensief alleen opgeschoonde tekst laten tonen en bewerken, zodat eventueel achtergebleven oude invoer geen HTML-code meer toont.
6. Controleren met de taak uit de screenshot, een omschrijving met meerdere alinea’s en een nieuwe synchronisatie; daarna typecontrole, build en browsercontrole uitvoeren.

## Resultaat
De screenshottekst wordt weergegeven als `1 dag na het event inplannen`, en toekomstige synchronisaties brengen de HTML-rommel niet terug.
