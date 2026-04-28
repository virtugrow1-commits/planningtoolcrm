## Doel

De documenten- en contractenomgeving krijgt een warme, verfijnde uitstraling (in lijn met VirtuGrow: bruin #9e523a + goud #e4bb7a) en wordt prettiger in gebruik — zonder de bestaande logica (sync, statussen, OFF-/FAC-nummers, GHL-koppeling) te raken.

## 1. Documenten-overzicht (`/quotes`)

**Header & KPI's**
- Rustiger header met subtiele goud-accent onder de titel.
- KPI-kaarten krijgen een lichte gradient (warm beige → wit), grotere cijfers, kleinere labels, en een gekleurd icoon-vlak in merkkleur i.p.v. grijs.
- Extra micro-info onder elk KPI (bijv. "+3 deze week" / "2 verlopen binnenkort").

**Zoek & filters**
- Zoekbalk verbreden, met sneltoets-hint (`⌘K`).
- Status-pills krijgen een actieve staat in merkkleur met goud-rand, en tonen een klein bolletje in de statuskleur.
- Filterbalk wordt sticky bij scrollen.

**Tabel**
- Hoogteritme verbeteren (12px rijen → rustiger), zebra-striping uit, hover in warm-beige.
- Documentnummer in monospaced kleur-accent, titel daarnaast in normale weight.
- Klant- en bedrijfsnaam samen in één cel met klein bedrijfslogo-bolletje (initialen).
- Bedragkolom rechts uitgelijnd, tabular-nums, met valuta-symbool subtiel grijs.
- Statuskolom met badge + datum eronder (bv. "Verzonden · 12 apr").
- "Verzonden / Bekeken / Getekend"-kolommen samenvoegen tot één compacte tijdlijn-cel (3 stipjes met datums in tooltip) → veel minder visuele ruis.
- Per rij een actie-menu (⋯) met: Openen, Kopieer link, Dupliceer, Verwijderen.
- Lege staat krijgt een vriendelijke illustratie + duidelijke "Nieuwe offerte"-CTA.

**Sjablonen-tab**
- Kaartjes worden grotere "documentkaarten" met:
  - Mini-preview van de eerste pagina (als er content_blocks/PDF-achtergrond is) of een goud accent-balk bovenaan.
  - Naam + omschrijving + datum + "Standaard"-badge in goud.
  - Hover toont actieknoppen (Openen, Dupliceer, Verwijder).
- Lege staat met grote CTA en suggesties ("Begin met een blank sjabloon" / "Importeer PDF").

## 2. Offerte- & factuurdetail (`/quotes/:id`, `/invoices/:id`)

**Sticky actiebalk**
- Header met terugknop, documentnummer, status en titel wordt sticky bij scrollen.
- Acties (Bewerken / Opslaan / Verstuur naar klant / Maak factuur / Verwijder) groeperen in een rustige rij; primaire actie altijd in merkkleur, secundair als outline.
- "Bewerken" en "Opslaan" wisselen op dezelfde plek (geen dubbele knop tegelijk).
- "Niet-opgeslagen wijzigingen"-indicator met goud bolletje naast de titel.

**Layout**
- Twee-koloms layout op desktop: links het document (klantkaart, intro, regels, voorwaarden), rechts een rustige zijbalk met:
  - Status & tijdlijn (verzonden → bekeken → geaccepteerd) als verticale stappen.
  - Totaalkaart (subtotaal, korting, btw, totaal) met merkkleur-accent.
  - Snelle acties (kopieer publieke link, download PDF, dupliceer).
- Mobiel: zijbalk klapt naar onderen.

**Lees-/bewerkmodus**
- In leesmodus: documentachtige typografie (serif heading voor titel, ruime regelafstand), warme papier-achtige achtergrond voor het document-blok.
- In bewerkmodus: duidelijke "Je bewerkt"-banner bovenaan met Opslaan/Annuleren.
- Verlopen-waarschuwing krijgt zachte amber-stijl (al aanwezig, iets verfijnen).

**Klantkaart**
- Avatar-bolletje met initialen, naam + bedrijf, e-mail/adres met iconen, klik door naar contact/bedrijf.

## 3. Klantportaal (publieke offertepagina, `/quote/view/:token`)

- Warme hero bovenaan met VirtuGrow-merkkleur, bedrijfslogo en "Offerte voor [Klant]".
- Documentnummer + geldig-tot in subtiele balk eronder.
- Document-content in een centrale "papier"-kaart met zachte schaduw en serif-koppen.
- Sticky actiebalk onderaan met grote primaire knop "Offerte accepteren" (merkkleur) en secundaire "Vragen stellen" (mailto).
- Na accepteren: vriendelijke bevestigingsstaat met checkmark en vervolgstappen.
- Mobiel-eerst: knoppen full-width onderaan.

## 4. Algemene UI-verfijningen (alleen binnen documenten-omgeving)

- Consistente afgeronde hoeken (rounded-xl), zachte schaduwen (`card-shadow`), subtiele borders.
- Statuskleuren consistent doortrekken: concept = neutraal, verzonden = info-blauw, bekeken = goud, geaccepteerd/betaald = succes-groen, afgewezen/verlopen = warm rood/amber.
- Skeleton loaders al aanwezig — uitbreiden naar detailpagina's voor rustigere laadervaring.
- Toasts compacter en altijd in merk-tinten.

## Wat ik NIET aanraak

- Geen wijzigingen aan sync-logica, GHL-koppeling, OFF-/FAC-nummering, btw-berekening, edge functions, of database-schema.
- Geen wijzigingen aan de template-editor zelf (alleen het kaartje in het overzicht).
- Bestaande Nederlandse terminologie blijft.

## Bestanden die ik ga aanpassen

- `src/pages/QuotesPage.tsx` — header, KPI's, filters, sjablonen-grid.
- `src/components/documents/UnifiedDocumentTable.tsx` — tabel-vormgeving, samengevoegde tijdlijn-cel, actie-menu.
- `src/pages/QuoteDetailPage.tsx` + `src/pages/InvoiceDetailPage.tsx` — sticky header, two-column layout, lees/bewerk-stijl.
- `src/pages/PublicQuotePage.tsx` — klantportaal hero + sticky CTA.
- Eventueel kleine helper-componenten voor: `DocumentTimelineCell`, `DocumentSidebar`, `DocumentRowActions`.

## Resultaat

Een documenten- en contractenomgeving die rustiger oogt, sneller te scannen is, duidelijker maakt wat je kunt doen, en bij de klant een professionele, warme indruk achterlaat — volledig in de VirtuGrow-stijl.