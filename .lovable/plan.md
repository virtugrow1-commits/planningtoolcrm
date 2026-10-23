## Deploy commit fce0a51 (zonder codewijzigingen)

1. **Controle projectmap**: bevestigen dat de huidige stand commit `fce0a51` is en dat er geen lokale verschillen zijn (alleen lezen).
2. **Deploy** van precies deze vier edge functions met de code uit GitHub:
   - `ghl-webhook`
   - `ghl-auto-sync`
   - `ghl-enrich-inquiry`
   - `stage-reservering`
3. **Controle per functie**: deploy-resultaat plus een korte testaanroep die alleen een veilige foutmelding oplevert (bijv. onbestaande aanvraag-ID), om te bevestigen dat de nieuwe versie zonder startfout draait.
4. **Rapport** per functie: gelukt/mislukt en of de projectmap gelijk is aan `fce0a51`.

Niet gedaan: geen migratie, geen bestanden wijzigen, niets publiceren.
