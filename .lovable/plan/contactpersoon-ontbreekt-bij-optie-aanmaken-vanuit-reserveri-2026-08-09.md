# Contactpersoon ontbreekt bij optie aanmaken vanuit Reserveringen

## Oorzaak (bevestigd)

Er staan 1332 contactpersonen in de database. De Reserveringen-pagina haalt contacten op via de hook `useContacts`, die één enkele query doet zonder paginering — die geeft maximaal 1000 rijen terug. Alles daarbuiten (gesorteerd op voornaam) ontbreekt dus in de keuzelijst.

De kalender gebruikt de gedeelde contactencontext, die wél in pagina's van 1000 doorleest en dus alle contacten toont. Vandaar het verschil.

Dezelfde hook wordt ook gebruikt op de aanvraag-detailpagina, dus daar treedt hetzelfde probleem op.

## Oplossing

`useContacts` gelijktrekken met de contactencontext:

- Contacten in pagina's van 1000 ophalen tot alles binnen is.
- Vertrokken contactpersonen ("uit dienst") blijven uitgefilterd in keuzelijsten zoals nu.

Daarmee tonen Reserveringen en Aanvragen dezelfde volledige lijst als de kalender.

## Technisch

- `src/hooks/useContacts.ts`: `select(...).order('first_name')` vervangen door een lus met `.range(from, from + 999)` die doorgaat zolang een pagina vol is (zelfde patroon als `ContactsContext`).
- Geen wijzigingen aan database of dialoogcomponenten nodig.

## Controle

Optie aanmaken vanuit Reserveringen: een contactpersoon achteraan het alfabet (bijv. iemand met voornaam beginnend met een late letter) moet nu gevonden worden, net als in de kalender.
