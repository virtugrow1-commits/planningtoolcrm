# CliqCRM-gegevens beschikbaar maken in de Casting tool (alleen lezen)

## Wat er komt
- CliqCRM krijgt een beveiligde "leesdeur" waar de Casting tool gegevens kan ophalen: contactpersonen, bedrijven en particulieren, aanvragen en reserveringen.
- Alleen lezen: de Casting tool kan in CliqCRM niets aanmaken, wijzigen of verwijderen. CliqCRM blijft de bron.
- Toegang alleen met een geheime sleutel die in beide tools bewaard wordt (niet zichtbaar in de code).
- In de Casting tool komt een kleine koppeling waarmee je de gegevens kunt ophalen en tonen (bijv. contact zoeken, aanvragen/reserveringen per klant).

## Stappen
1. In CliqCRM: nieuwe beveiligde functie `crm-read-api` met onderdelen:
   - `contacts` (naam, e-mail, telefoon, mobiel, verjaardag, bedrijf, uit dienst)
   - `companies` (bedrijven en particulieren, adres, type)
   - `inquiries` (aanvragen met status, datum, gasten, primaire contactpersoon)
   - `bookings` (reserveringen met zaal, datum/tijd, status, gekoppelde aanvraag)
   - zoeken (`q`), filters (bijv. `company_id`, `from`/`to` datum), paginering (max 500 per keer).
2. Een willekeurige geheime sleutel aanmaken in CliqCRM.
3. Diezelfde sleutel veilig in de Casting tool opslaan (je krijgt een formulier om hem in te vullen; ik laat hem eenmalig zien waar nodig).
4. In de Casting tool een eigen serverfunctie die CliqCRM aanroept en de gegevens doorgeeft aan de schermen daar.
5. Testen: ophalen zonder sleutel wordt geweigerd, met sleutel komen de juiste gegevens terug.

## Technisch
- Edge function in CliqCRM, `verify_jwt = false`, controle op header `x-api-key` tegen secret `CASTING_TOOL_API_KEY` (constant-time vergelijking); gebruikt service role en filtert op de organisatie-eigenaar (bestaande multi-tenancy-regel).
- Alleen GET; expliciete kolommen, geen interne sync-velden; datums dd-MM-yyyy in weergave aan Casting-kant.
- Casting tool: edge function `crm-proxy` met secrets `CLIQCRM_API_URL` en `CLIQCRM_API_KEY`; frontend roept alleen de proxy aan, sleutel nooit in de browser.
- Stap 4 gebeurt in het Casting-project; daarvoor schakel ik dat project in via de projectkoppeling.
