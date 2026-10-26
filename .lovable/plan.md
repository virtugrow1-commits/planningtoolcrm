# Knoppen bij een aanvraag netter indelen

Alleen de opmaak verandert; wat de knoppen doen blijft precies hetzelfde.

## Nieuwe indeling (onderaan het aanvraagblok)

```text
[ Bewerken ]            [ -> Stadium wijzigen ]     <- bovenaan, zoals nu

Acties
[ Maak optie ]          [ Offerte klaarzetten ]     <- naast elkaar, even groot
  Offerte klaargezet: revisie 04 op 30-09-2026 11:26 (klein, onder de offerteknop)

Reserveringsbevestiging
[ Reserveringsbevestiging klaarzetten ]             <- volle breedte
  (Offerte nog niet getekend) (Bevestiging nog niet klaargezet)

[ Formuliergegevens ophalen uit CliqCRM ]           <- verplaatst naar binnen het blok,
                                                       als rustige tekstknop onderaan
```

- Kleine kopjes "Acties" en "Reserveringsbevestiging" maken de groepen duidelijk.
- Alle knoppen krijgen dezelfde hoogte en stijl; alleen "Stadium wijzigen" blijft de opvallende hoofdknop (en "Reserveringsbevestiging" wordt opvallend zodra de offerte getekend is, zoals nu).
- De losse knop "Formuliergegevens ophalen" staat nu buiten het blok en ziet er uit als een losse balk; die komt binnen het blok onderaan, kleiner en minder nadrukkelijk.
- Op een smal scherm vallen de naast-elkaar-knoppen netjes onder elkaar.

## Technisch
- Alleen `src/components/inquiry/InquiryDetailsTab.tsx` (regels ~262–397): Maak optie + Offerte klaarzetten in `grid grid-cols-1 sm:grid-cols-2 gap-2`, sectiekopjes `text-xs uppercase text-muted-foreground`, enrich-knop als `variant="ghost"` binnen de kaart. Geen logica, geen backend.
