## Deploy commit 92732e8 (zonder codewijzigingen)

1. **Controle projectmap** (alleen lezen): bevestigen dat commit `92732e8` in de projectmap zit en dat sinds de vorige deploy alleen `_shared/inquiryFields.ts` en de test zijn gewijzigd.
2. **Deploy** van precies deze drie functies met de code uit GitHub:
   - `ghl-webhook`
   - `ghl-auto-sync`
   - `ghl-enrich-inquiry`
3. **Controle per functie**:
   - `ghl-enrich-inquiry`: testaanroep met een niet-bestaande aanvraag-ID, verwacht de eigen melding "Inquiry not found".
   - `ghl-webhook`: lege POST, verwacht `{"success": true}` (wordt veilig genegeerd).
   - `ghl-auto-sync`: geen testaanroep (die start een echte sync); controle via de logs van de eerstvolgende geplande run (opstarten plus foutloze afronding).
4. **Rapport** per functie: gelukt of mislukt, plus de projectmapcontrole.

Niet gedaan: geen migratie, geen bestanden wijzigen, niets publiceren.
