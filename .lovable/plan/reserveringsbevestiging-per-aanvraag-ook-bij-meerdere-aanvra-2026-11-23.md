# Reserveringsbevestiging per aanvraag, ook bij meerdere aanvragen van hetzelfde bedrijf

## Wat er nu misgaat (gevonden in de code)
1. **Eén set velden per contactpersoon in CliqCRM.** De bevestiging schrijft alle gegevens (reserveringsnummer, datum, zaal, begroting, lunch/borrel/diner) in vaste velden op het contact. Een tweede aanvraag van dezelfde persoon overschrijft dus de eerste, en een bevestiging die later uit CliqCRM wordt verstuurd toont wat er toevallig het laatst in stond.
2. **Verkeerde factuur/begroting.** De begroting wordt gezocht tussen álle facturen van het contact, op titel. Offertes uit hetzelfde sjabloon hebben dezelfde titel (bijv. "Offerte_sjabloon-Proeverij & Kookstudio"), dus de eerste die gevonden wordt kan van een eerdere aanvraag zijn.
3. **Getekende offerte zonder aanvraag-koppeling.** Als de offerte niet aan de aanvraag hangt, wordt de nieuwste losse getekende offerte van het contact gepakt; die kan bij een andere aanvraag horen.
4. **Losse reserveringen op dezelfde dag** van hetzelfde contact worden meegenomen, ook als ze bij een andere aanvraag horen.

Het reserveringsnummer zelf ligt per aanvraag vast; het "overschrijven" zie je doordat punt 1 het nummer op het contact vervangt.

## Aanpak
1. **Eerst naspelen** met een echt geval (het bedrijf waar je het zag): per aanvraag laten zien welk nummer, welke offerte en welke factuur gekozen worden. Pas dan aanpassen.
2. **Factuur strikt koppelen** aan de getekende offerte van déze aanvraag: eerst op het CliqCRM-document-id/offertenummer, dan titel + bedrag + tekendatum na het aanmaken van de aanvraag. Geen zekere match = geen begroting overnemen en een duidelijke waarschuwing tonen, in plaats van een oude te pakken.
3. **Losse offertes** alleen gebruiken als ze na deze aanvraag getekend zijn én niet al bij een andere aanvraag in gebruik zijn.
4. **Losse reserveringen** alleen meenemen als ze aan geen enkele aanvraag hangen (zo is het nu al) én het contact op die dag geen andere aanvraag heeft.
5. **Bevestiging direct versturen na klaarzetten** wordt de afspraak: in de app komt bij "Reserveringsbevestiging klaarzetten" de melding welke aanvraag nu in de velden staat ("Velden bevatten nu RES-xxxx — verstuur de bevestiging nu"). Op de aanvraagpagina zie je ook of een andere aanvraag van dit contact later is klaargezet.
6. Tests voor: twee aanvragen met hetzelfde sjabloon, losse offerte van een eerdere aanvraag, twee reserveringen op één dag.
7. stage-reservering (en stage-offerte, die ook op contactvelden schrijft) opnieuw deployen. Niet publiceren.

## Open punt
CliqCRM kan per contact maar één set velden hebben. Echt los van elkaar werkt het alleen als de bevestiging aan de opportunity (aanvraag) hangt in plaats van aan het contact; dat vraagt een aanpassing van het sjabloon in CliqCRM. Dat neem ik niet mee tenzij je dat wilt.

## Technisch
- `_shared/begroting.ts` `pickInvoice`: match op offertenummer/ghl_document_id eerst, titel alleen samen met bedrag en datum >= inquiry.created_at; geen fallback naar willekeurige match.
- `_shared/reservering.ts` `pickSignedQuoteForInquiry`: losse docs uitsluiten als ze al gekoppeld zijn aan andere inquiry via inquiry.reservering_gestaged_op/offerte-gebruik.
- `stage-reservering/index.ts`: extra bookings filteren op afwezigheid van andere inquiries van contact op die datum; response uitbreiden met `vorige_gestaged` info.
- `InquiryDetailsTab.tsx`: melding na klaarzetten.
