

## Plan: Documenten beter, voorbeeld werkend, contactgegevens automatisch

### Wat er nu mis gaat

1. **Adres wordt niet ingevuld** bij contact-selectie als het contact geen gekoppeld bedrijf heeft, of als het bedrijf nog niet in de cache zit.
2. **Witte voorbeeldpagina**: het sjabloon slaat de PDF-achtergrond op onder de naam `pdfBackgroundUrl` / `editorPdfUrl`, maar de voorbeeld-component zoekt naar `pdfUrl`. Daardoor blijft het wit.
3. **Producten staan niet in het document**: de regelitems uit de offerte worden alleen getoond in een aparte kaart, maar **niet** in het PDF-voorbeeld of als duidelijk product-overzicht in het document.
4. **Onduidelijke voorbeeldweergave**: huidige preview toont alleen losse blokken op een witte achtergrond — niet hoe de klant het echt ziet.

### Wat er gaat veranderen

**1. Voorbeeld werkt direct met PDF-achtergrond**
- `TemplatePreview` accepteert nu zowel `pdfUrl`, `pdfBackgroundUrl` als `editorPdfUrl` (terugvallen op wat aanwezig is).
- `NewQuotePage` geeft alle drie de mogelijke velden mee.
- Effect: zodra een sjabloon met PDF gekozen wordt, zie je in het voorbeeld direct de echte achtergrond.

**2. Producten verschijnen op het document**
- In de voorbeeldmodal wordt onder de PDF-pagina's een nette **Productentabel** gerenderd met:
  - Omschrijving (+ subomschrijving)
  - Aantal · Stukprijs · BTW · Regeltotaal
  - Subtotaal, BTW, Totaal incl. BTW
- Dezelfde tabel wordt door de PDF-generator (edge function) op een nieuwe pagina toegevoegd aan de bijlage, ná de sjabloon-pagina's. Zo komen de producten **altijd** in de e-mailbijlage terecht — ook als het sjabloon zelf geen `product-list`-blok bevat.
- Als het sjabloon wél een `product-list`-blok heeft, wordt die met de gekozen producten gevuld in plaats van extra pagina toe te voegen.

**3. Adres + bedrijfsgegevens automatisch invullen**
- Bij het kiezen van een contactpersoon wordt het bedrijf direct opgehaald (ook als het nog niet in de lokale cache zit) met:
  - Adres (straat, postcode, plaats, land)
  - E-mail van het contact
  - Bedrijfsnaam, KvK, BTW (voor merge-tags in het sjabloon)
- Als het contact geen gekoppeld bedrijf heeft, wordt netjes alleen de naam + e-mail ingevuld en blijven de andere velden leeg-bewerkbaar.

**4. Duidelijker voorbeeld-layout (zoals klant het ziet)**
- Voorbeeldmodal krijgt een A4-pagina-look (witte pagina, schaduw, juiste verhouding) met:
  - Sjabloon-PDF als achtergrond per pagina
  - Klantgegevens-kaart bovenaan ("Voor: …, Bedrijf: …, E-mail: …, Geldig tot: …")
  - Productentabel met totalen
  - Algemene voorwaarden onderaan
- Knop "Download voorbeeld-PDF" zodat je exact dezelfde PDF ziet die de klant via e-mail ontvangt (genereert via bestaande `generate-quote-pdf` zonder verzending).

### Bestanden

- **Aangepast**: `src/components/quotation/TemplatePreview.tsx` — accepteer alle PDF-veldnamen, voeg productentabel + klantkaart toe, A4-styling.
- **Aangepast**: `src/pages/NewQuotePage.tsx` — fix contact→bedrijf→adres ophalen (ook als bedrijf niet in cache), geef juiste pdfUrl door, voeg "Download voorbeeld" knop toe.
- **Aangepast**: `supabase/functions/generate-quote-pdf/index.ts` — voeg productentabel-pagina toe na sjabloon-pagina's, vul `product-list`-blokken indien aanwezig met de offerte-regelitems.
- **Aangepast**: `src/components/quotation/ContactSelector.tsx` — geef ook adres-velden door indien beschikbaar.

### Beperkingen

- De PDF-bijlage wordt opnieuw gegenereerd op moment van versturen, dus het voorbeeld komt 1-op-1 overeen met de bijlage.
- Productentabel wordt op een extra pagina geplaatst tenzij het sjabloon expliciet een `product-list`-blok heeft (dan wordt die gevuld).

