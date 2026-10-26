# Knoppen bij een aanvraag netter indelen

Alleen de opmaak verandert; wat de knoppen doen blijft precies hetzelfde.

## Nieuwe indeling (onderaan het aanvraagblok)

```text
[ Bewerken ]                 [ -> Stadium wijzigen ]
[ Maak optie ]                                        <- volle breedte

[ Offerte klaarzetten ]      [ Reserveringsbevestiging klaarzetten ]   <- naast elkaar, even groot
  revisie 04 op 30-09 11:26    (Offerte nog niet getekend)
                               (Bevestiging nog niet klaargezet)

[ Formuliergegevens ophalen uit CliqCRM ]  <- binnen het blok, rustige kleine knop
```

- Offerte en reserveringsbevestiging staan naast elkaar, elk met hun eigen statusregel eronder.
- Alle knoppen even hoog en in dezelfde stijl; "Stadium wijzigen" blijft de opvallende hoofdknop, en de reserveringsknop wordt opvallend zodra de offerte getekend is (zoals nu).
- De losse balk "Formuliergegevens ophalen" komt binnen het blok, kleiner en minder nadrukkelijk.
- Op een smal scherm vallen de knoppen netjes onder elkaar.

## Technisch
- Alleen `src/components/inquiry/InquiryDetailsTab.tsx` (regels ~262–397): offerte- en reserveringskolom in `grid grid-cols-1 sm:grid-cols-2 gap-2`, statusregels/badges per kolom, enrich-knop als `variant="ghost"` binnen de kaart. Geen logica of backend.
