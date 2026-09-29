# Laatste drie punten oplossen

Alles in de testversie. Er wordt niets gepubliceerd.

## 1. De 7 testscenario's doorlopen (desktop en mobiel)
Ik maak een tijdelijke klant "Testbedrijf BV" aan. Alle testgegevens krijgen "TEST" in de naam.
1. Een nieuwe klant maken, als bedrijf en als particulier, en controleren of de invoer goed wordt gecontroleerd.
2. Een aanvraag maken met een primaire en een tweede contactpersoon.
3. Een taak op de aanvraag en een taak op de klant maken, en controleren dat ze apart blijven.
4. Een notitie toevoegen en de status wijzigen, en controleren dat dit in de geschiedenis verschijnt.
5. Een optie en een reservering maken vanuit de aanvraag.
6. Zoeken zonder rekening te houden met hoofdletters en accenten.
7. Controleren dat de klantkaart de cijfers, de reserveringen en de aanvragen goed laat zien.

Wat misgaat, los ik meteen op. De testgegevens gaan niet naar GHL, en "Offerte klaarzetten" wordt niet echt uitgevoerd.

**Opruimen (met jouw akkoord via dit plan):** daarna verwijder ik alleen de gegevens van Testbedrijf BV. Dat zijn de klant, de contactpersonen, de aanvraag, de taken, de optie, de reservering en de geschiedenis. Voor het verwijderen controleer ik eerst welke gegevens precies geraakt worden.

## 2. Vreemde tekens in namen herstellen
- Ik zoek alle bedrijven, contactpersonen, aanvragen en reserveringen met kapotte tekens zoals "CafÃ" in plaats van "Café".
- Die maak ik in één keer weer goed. Daarbij wordt alleen dat stukje tekst vervangen.
- Ik controleer ook waar zulke tekens binnenkomen, zodat ze niet terugkomen bij de volgende sync.

## 3. Documenten ophalen uit GHL
- Dit kan ik niet zelf oplossen. De toegang moet in GoHighLevel worden aangepast.
- Ik zoek in het logboek op welk verzoek GHL precies weigert. Daarna geef ik je de exacte rechten die de sleutel nodig heeft, bijvoorbeeld "Documents & Contracts".
- Ik zorg er ook voor dat deze melding niet 71 keer per dag terugkomt. Er komt één duidelijke melding, en de rest van de sync blijft gewoon werken.

## Blijft bij jou
- In GHL de rechten van de sleutel aanpassen.
- De previewlink naar de klant sturen en pas na akkoord publiceren.

## Technisch
- Test via Playwright met `lovable auth-session --self`. Het opruimen gebeurt met gerichte DELETE-opdrachten op de ID's van de testrecords, niet op namen.
- Voor de tekens: een UPDATE met `replace()` op basis van dezelfde MOJIBAKE_MAP als `fixEncoding.ts`, alleen voor rijen die met `Ã` matchen. Controleer ook of de inkomende paden in ghl-auto-sync en ghl-webhook `fixEnc` gebruiken.
- Voor de documenten: controleer de 401/403-meldingen in de logs van ghl-auto-sync. Bij een weigering sla ik de documentstap over tot de volgende volledige sync.
