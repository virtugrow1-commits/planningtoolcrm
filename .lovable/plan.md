

## Plan: Offerte verzenden via e-mail met PDF-bijlage

### Wat ik heb gevonden

De huidige "Markeer verzonden"-knop verandert alleen de status in de database — er wordt **geen e-mail verstuurd**. De klant krijgt ook geen bijlage. De publieke link (`/quote/view/:token`) bestaat wel, maar wordt niet automatisch verzonden.

Het domein `ontmoetenaandedonge.nl` is nog **niet gekoppeld** aan deze omgeving voor e-mailverzending. Om e-mails vanaf `contact@ontmoetenaandedonge.nl` te kunnen versturen, moet dit domein eenmalig geverifieerd worden (DNS-records).

### Wat er gaat gebeuren

**1. E-maildomein instellen** (eenmalig, door jou)
- Een setup-dialoog opent waarin je `ontmoetenaandedonge.nl` toevoegt als afzenddomein
- Je voegt een paar DNS-records toe bij je domeinprovider
- Verificatie kan tot 72 uur duren, maar de rest kan vast worden gebouwd

**2. PDF-generator (edge function)**
- Nieuwe edge function `generate-quote-pdf` die op basis van een offerte-ID een PDF rendert (gebaseerd op `content_blocks` en regelitems van de offerte, met huisstijl)
- PDF wordt opgeslagen in de bestaande `quote-pdfs` storage bucket
- De URL en bestand worden teruggegeven

**3. E-mailverzending (edge function + template)**
- Nieuwe edge function `send-quote-email` die:
  - De PDF genereert (of hergebruikt indien al aanwezig)
  - Een nette e-mail samenstelt met: aanhef, intro-tekst, totaalbedrag, link naar offerte (publieke pagina), en PDF als **bijlage**
  - Verstuurt vanaf `contact@ontmoetenaandedonge.nl`
  - Status van de offerte op `sent` zet en `sent_at` registreert
  - Een activiteit logt op de gekoppelde aanvraag/contact

**4. UI-aanpassing op de offertepagina**
- De huidige "Markeer verzonden"-knop wordt vervangen door **"Verstuur naar klant"**
- Bij klik opent een bevestigingsdialoog met:
  - E-mailadres ontvanger (vooringevuld vanuit `clientEmail`, aanpasbaar)
  - Onderwerpregel (bewerkbaar)
  - Persoonlijk berichtje (bewerkbaar, optioneel)
  - Voorbeeld van de bijlage
- Naast de hoofdknop blijft een "Markeer handmatig verzonden" optie bestaan voor offertes die buiten het systeem om verstuurd zijn

**5. Tracking**
- Verzonden e-mails worden gelogd zodat je in de offerte-historie ziet wanneer de mail is verstuurd en naar welk adres

### Beperkingen / opmerkingen

- Verzending werkt pas écht zodra DNS-verificatie van `ontmoetenaandedonge.nl` is voltooid. De build kan al af, maar live verzenden wacht op DNS.
- Voor de PDF gebruik ik een server-side renderer (in de edge function) zodat opmaak consistent blijft, ook als de klant geen toegang heeft tot het systeem.

### Bestanden

- **Nieuw**: `supabase/functions/generate-quote-pdf/index.ts`
- **Nieuw**: `supabase/functions/send-quote-email/index.ts`
- **Nieuw**: `src/components/quotation/SendQuoteDialog.tsx`
- **Aangepast**: `src/pages/QuoteDetailPage.tsx` (knop + dialoog koppelen)
- **Database**: kleine uitbreiding op `quotes` voor `last_sent_to` en `last_sent_at` (optioneel, voor tracking)

