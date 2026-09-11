# CRM 2.0: nettere menubalk, duidelijke structuur, offertes eruit

Drie dingen: de menubalk krijgt een rustige, moderne indeling, elke detailpagina laat bovenaan zien waar je zit in de keten, en het offerte-/factuurgedeelte verdwijnt uit het CRM. De gegevens gaan zoals afgesproken door naar GHL via "Offerte klaarzetten".

## 1. Menubalk

Nieuwe indeling, dezelfde huisstijlkleuren:

```text
[ CliqCRM ]        Dashboard  Taken  CRM  Aanvragen  Kalender        [ NL ]  [ sync ]  [ AB v ]
```

- Links de naam CliqCRM als klikbaar logo, terug naar het dashboard.
- De vijf menu-items gecentreerd, met een duidelijk maar rustig actief item.
- Rechts: taalknop en synchroniseren als losse icoonknoppen, en instellingen + afmelden samengevoegd onder de accountknop, zodat rechts minder rommelig is.
- Het rode bolletje met het aantal ongelezen aanvragen blijft.
- Op mobiel: naam links, hamburger rechts, menu-items onder elkaar in het uitklapmenu inclusief instellingen.

## 2. Boomstructuur zichtbaar maken

Bovenaan elke detailpagina komt het volledige pad, elk deel aanklikbaar:

```text
Bedrijven › Bliss Hypotheken
Bedrijven › Bliss Hypotheken › Jan de Vries
Bedrijven › Bliss Hypotheken › Aanvraag Personeelsfeest
Bedrijven › Bliss Hypotheken › Aanvraag Personeelsfeest › 13-09-2026 14:00-18:00
Bedrijven › Bliss Hypotheken › Aanvraag Personeelsfeest › Taak: Menu doorgeven
```

- Ontbreekt een schakel (bijvoorbeeld een optie zonder aanvraag), dan wordt die schakel overgeslagen en zie je een zachte melding dat de koppeling nog mist.
- Bij een particulier staat de naam van de persoon in plaats van een bedrijfsnaam.
- Dit vervangt de losse "Terug"-knoppen bovenaan; het pad doet hetzelfde werk en laat meer zien.
- De keten volgt de afspraak: bedrijf › contactpersoon › aanvraag › reservering/optie, en taken hangen aan een aanvraag of contactpersoon.

## 3. Offertes en facturen uit het CRM

Weg uit de app:

- De pagina Documenten met offertes, facturen en sjablonen, en het aanmaken/bewerken ervan.
- Het blok "Offertes" op het dashboard.
- De verwijzingen naar offertes en facturen op de bedrijfs-, contactpersoon- en aanvraagpagina.
- De e-mailverzending van offertes vanuit het CRM.

Blijft staan:

- De knop "Offerte klaarzetten" bij een aanvraag, die de gegevens naar GHL stuurt, plus de regel met de revisie en datum.
- Statussen als "Offerte Verzonden" en "Aangepaste Offerte" bij aanvragen, want die komen uit GHL.
- De reeds opgeslagen offertegegevens in de database blijven bewaard, ze zijn alleen niet meer zichtbaar of aanpasbaar. Er wordt niets verwijderd.

## Technische uitwerking

- `src/components/AppLayout.tsx`: logo-slot links, `nav` gecentreerd via drie-koloms flex-layout, rechterzijde ingedikt en instellingen naar het account-dropdownmenu.
- Nieuw `src/components/Breadcrumbs.tsx` (bouwt op `ui/breadcrumb`), toegepast in `CompanyDetailPage`, `ContactDetailPage`, `InquiryDetailPage`, `BookingDetailPage` en `TaskDetailPage`. Keten wordt afgeleid uit `company_id`, `contact_id` en `inquiry_id` met dezelfde fallbacks als `src/lib/inquiryBookings.ts` en `src/lib/taskBookingLink.ts`.
- Verwijderen: `QuotesPage`, `NewQuotePage`, `QuoteDetailPage`, `InvoiceDetailPage`, `TemplateEditorPage`, `src/components/quotation/*`, `src/components/template-editor/*`, `src/components/documents/*`, hooks `useQuotes`, `useInvoices`, `useQuoteTemplates`, `useUnifiedDocuments`, `useDocuments`, plus de bijbehorende routes in `App.tsx` en het offerteblok in `Dashboard.tsx`.
- `PublicQuotePage` en `/quote/view/:token` blijven bestaan zolang er nog verstuurde links in omloop zijn; er wordt niets meer nieuw aangemaakt.
- Edge functions `stage-offerte` blijft ongewijzigd. `generate-quote-pdf` en `send-quote-email` worden niet meer vanuit de app aangeroepen en blijven ongedeployed-onaangeraakt.
- Geen databasewijzigingen. Afsluitend `bunx tsgo --noEmit`.
