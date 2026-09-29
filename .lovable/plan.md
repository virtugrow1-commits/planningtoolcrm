# Narrowcasting koppelen zonder directe database-toegang

## Doel
De narrowcasting verbinden met de CRM zonder dat die rechtstreeks bij de database (Supabase) hoeft. De bestaande leesfunctie `crm-read-api` is daarvoor al gebouwd: dat is een gewone weblink (REST API) die gegevens als JSON teruggeeft.

## Aanpak

1. **Narrowcasting roept de leesfunctie aan** — geen database-verbinding nodig. De tool (of een klein tussenstukje) doet een HTTPS-verzoek naar de functie met de geheime sleutel in de header en krijgt nette gegevens terug.
2. **Beschikbare gegevens via de functie:** zalen, bedrijven, contactpersonen, aanvragen en reserveringen (inclusief eventnaam, datum en tijden — wat een narrowcasting-scherm typisch nodig heeft).
3. **Geheime sleutel** — dezelfde sleutel die ook voor de Casting tool is bedoeld; nog één keer invullen via het beveiligde formulier (is nog niet gebeurd).
4. **Documentatie voor de leverancier** — korte handleiding met de weblink, de header-naam en voorbeeldverzoeken, zodat de narrowcasting-leverancier (of het tussenstukje) het kan aansluiten.
5. **Optioneel later: webhooks** — als het scherm realtime moet meebewegen, kan de CRM bij elke reserveringswijziging automatisch een bericht naar de narrowcasting sturen. Nu buiten scope.

## Technische details
- Bestaande edge function `crm-read-api` (al gedeployed) hergebruiken; eventueel een extra query-parameter toevoegen als de narrowcasting een specifiek formaat of subset wil (bijv. alleen reserveringen van vandaag).
- Sleutel via `add_secret` opslaan (header `x-api-key`).
- Handleiding als kort document (endpoint-URL, headers, voorbeeld-cURL, veldoverzicht).
- Niets publiceren; preview blijft leidend tot klantakkoord.

## Voorwaarde
De narrowcasting-tool of -leverancier moet een weblink (API) kunnen aanroepen. Als de tool alleen bestandsimport (CSV/XML) ondersteunt, wordt in plaats daarvan een periodieke export gebouwd.
