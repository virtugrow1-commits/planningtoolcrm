# Tags verdwijnen na opslaan — onderzoeken en oplossen

## Wat we al weten
- Een tag kiezen op de contactkaart slaat hem op in CliqCRM en stuurt hem direct door naar GoHighLevel. Die doorgifte meldt steeds "gelukt" (laatste: 20-10-2026).
- De automatische sync (elke paar minuten) neemt de tags uit GoHighLevel **altijd** over en overschrijft daarmee de tags in CliqCRM — zonder te kijken of er net lokaal iets is gewijzigd. Bij alle andere velden geldt wel de 24-uursbescherming; bij tags niet.
- Als GoHighLevel de nieuwe tag nog niet (of anders gespeld) teruggeeft, wordt hij in CliqCRM dus weer gewist. Dit is de meest waarschijnlijke oorzaak, maar nog niet bevestigd.

## Stap 1 — Oorzaak bevestigen
- Een testtag op één contact zetten en per sync-run vastleggen wat GoHighLevel teruggeeft en wat CliqCRM opslaat.
- Ook nagaan of andere plekken tags overschrijven: bewerken van het contact (oude taglijst meegestuurd), de webhook vanuit GoHighLevel en de automatisering "statustag op contact".

## Stap 2 — Oplossen
- **Bescherming zoals bij andere velden:** is een tag in CliqCRM in de afgelopen 24 uur gewijzigd, dan wint CliqCRM; de sync stuurt de tags dan opnieuw naar GoHighLevel in plaats van ze te wissen.
- **Samenvoegen in plaats van vervangen** waar mogelijk, zodat een tag die alleen aan één kant staat niet stil verdwijnt.
- **Bewerken van een contact** stuurt alleen de tags mee als die echt veranderd zijn (geen verouderde lijst).
- Hoofdletters/spaties maken geen verschil meer bij het vergelijken.

## Stap 3 — Controleren
- Tag toevoegen en verwijderen, twee sync-runs afwachten: tag blijft staan in CliqCRM én in GoHighLevel.
- Kleine test voor de regel "lokale tagwijziging binnen 24 uur wint van GoHighLevel".

## Technisch
- `ghl-auto-sync`: tag-mirrorblok (~regel 1145) respecteert `last_local_edit_at`/`pending_outbound_sync`; bij lokale winst `PUT /contacts/{id}` met tags.
- `ghl-webhook` (~regel 742–771) zelfde regel; `ghl-sync` sync-contacts idem.
- `ContactsContext.updateContact` / ContactDetailPage: `last_local_edit_at` zetten bij tagwijziging; geen stale `tags` meesturen bij formulierbewerking.
- Pure helper in `_shared/ghlCommon.ts` + unit test.
- Deploy `ghl-auto-sync`, `ghl-webhook`, `ghl-sync`; frontend niet publiceren.
