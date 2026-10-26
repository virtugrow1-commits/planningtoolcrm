# Gastenaantal-migratie + deploy (commit 6f3c22f)

Projectmap staat op 6f3c22f (laatste commit op main).

## Stappen
1. Migratie `20261026120000_gastenaantal_aanvraag_reservering.sql` byte-voor-byte uitvoeren. Inhoud: twee functies + twee triggers die het aantal gasten tussen aanvraag en bijbehorende reserveringen (optie/bevestigd) gelijk houden; reserveringen met een afwijkend aantal blijven staan. Geen data verwijderd (alleen `DROP TRIGGER IF EXISTS` vóór het aanmaken).
2. Controleren dat beide triggers bestaan.
3. Deployen: stage-reservering, ghl-sync, ghl-auto-sync.
4. Per functie verifiëren: stage-reservering via testaanroep met niet-bestaande aanvraag (verwacht "Aanvraag niet gevonden"); ghl-sync via veilige testaanroep zonder echte actie; ghl-auto-sync via de eerstvolgende cron-run in de logs (boot + foutloze afronding).
5. Resultaat per stap rapporteren.

Geen codewijzigingen, niets publiceren.
