# Klantinvoer-tekst verspringt bij aanvragen

## Wat er gebeurt

Bij aanvraag ANV-001737 (Kaasland Dongen / Sarina Schreuders) staat de tekst in de database in de juiste volgorde. Het verspringen ontstaat pas in de weergave: het blok "Klantinvoer" op de aanvraagpagina knipt het bericht per regel op en verdeelt die regels over twee secties.

Elke regel met een dubbele punt binnen de eerste 40 tekens wordt als "veld: waarde" gezien en bovenaan bij de formuliervelden gezet. Een gewone volzin als "We hebben hierin 2 keuzes: Italiaans of Spaanse tapas..." wordt dus als veld met label "We hebben hierin 2 keuzes" bovenaan geplaatst, terwijl de aanhef ("Hi Sarina, dank voor jouw berichtje...") onderaan onder "Opmerkingen" belandt. Daarnaast worden lege regels weggefilterd, waardoor alinea-witruimte verdwijnt.

## Wat er verandert

1. Strengere detectie van echte formuliervelden. Een regel wordt alleen als veld behandeld als:
   - het deel voor de dubbele punt kort is (max ~35 tekens) en uit maximaal ~4 woorden bestaat,
   - dat deel geen zinsafsluitende tekens bevat (punt, komma, uitroepteken, vraagteken, haakjes),
   - én het label overeenkomt met een bekend formulierlabel of GHL-veld-id (Type gelegenheid, Gewenste datum, Aantal gasten, Bedrijfsnaam, Selecteer dagdeel, Extra informatie, Toelichting, enz.) of het patroon van een veldnaam heeft.
   Volzinnen met een dubbele punt blijven daarmee vrije tekst.
2. Vrije tekst wordt in de originele volgorde en met behoud van lege regels (alinea's) weergegeven; alleen dubbele lege regels worden samengevouwen.
3. Meerregelige veldwaarden blijven bij hun veld: als een formulierveld (bijv. "Extra informatie:") gevolgd wordt door regels zonder eigen label, worden die als vervolg van die waarde weergegeven in plaats van als losse opmerking.
4. Als er helemaal geen betrouwbare velden gevonden worden, wordt het bericht als één doorlopende tekst getoond, precies zoals opgeslagen.

## Technisch

- Enige aan te passen bestand: `src/components/inquiry/InquiryDetailsTab.tsx` — de parsing-logica (regels ~69-93) en de rendering van "Klantinvoer" (regels ~294-313).
- De parsinglogica wordt naar een kleine, testbare helper verplaatst (`src/lib/inquiryMessage.ts`) met de bestaande `FIELD_LABEL_MAP` voor GHL-veld-ids, plus een lijst bekende labels.
- Geen database- of edge-function-wijzigingen: de opgeslagen tekst blijft ongewijzigd.
