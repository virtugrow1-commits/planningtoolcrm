

## Doel

Twee verbeteringen aan de offerte-flow:

1. **PDF-achtergrond uit het sjabloon** moet zichtbaar zijn in álle weergaven (voorbeeld in de app, klantportaal én e-mailbijlage). Nu zie je in het voorbeeld alleen de tekstblokken op een witte pagina.
2. **Bedrijven en contactpersonen selectors** tonen niet de volledige CRM-lijst — er zit een verborgen limiet van 100 op de dropdown waardoor de meeste opties ontbreken.

---

## 1. PDF-achtergrond overal zichtbaar

### Huidige situatie
| Plek | PDF-achtergrond zichtbaar? |
|---|---|
| Sjabloon-editor | ✅ ja |
| Nieuwe offerte preview (`NewQuotePage`) | ✅ ja (gebruikt `TemplatePreview`) |
| Offerte-detail preview-dialog (`QuotePreviewDialog`) | ✅ ja |
| **Klantportaal (`/quote/view/:token`)** | ❌ **nee** — gebruikt `DocumentViewer` zonder PDF |
| **E-mailbijlage (PDF)** | ⚠️ deels — werkt alleen als `quote.pdf_url` is gevuld |

### Aanpassingen

**A. Klantportaal — `src/pages/PublicQuotePage.tsx`**
- `DocumentViewer` vervangen door `TemplatePreview` zodat de klant exact dezelfde PDF-layout met overlay-blokken ziet als in de interne preview.
- De velden `pdf_url`, `content_blocks` en (indien aanwezig) `lineItems` doorgeven aan `TemplatePreview`.
- Handtekening- en checkbox-interactie blijft bovenop de preview werken via een aparte sectie onder het document (huidige logica behouden).

**B. PDF-bijlage — `src/pages/NewQuotePage.tsx`**
- In `persistQuote()` is `pdfUrl: templatePdfUrl` al doorgegeven, maar als `tplCb?.pdfUrl` leeg is wordt `undefined` gestuurd. We hebben een fallback nodig die ook kijkt naar `pdfBackgroundUrl` en `editorPdfUrl`. Deze fallback bestaat al in regel 196, dus dit werkt — **maar** we voegen een extra check toe: als de sjabloon wél een PDF heeft maar de offerte hem nog niet, vullen we hem alsnog in tijdens de PDF-generatie.

**C. PDF-generatie — `supabase/functions/generate-quote-pdf/index.ts`**
- Reeds correct: als `quote.pdf_url` leeg is, fetcht hij de template via `quote.template_id` en gebruikt `tpl.content_blocks.pdfUrl`. We voegen dezelfde fallback voor `pdfBackgroundUrl` / `editorPdfUrl` toe.

**D. E-mail verzending — `supabase/functions/send-quote-email/index.ts`**
- Werkt al correct: roept `generate-quote-pdf` aan en hangt de PDF als bijlage. Geen wijziging nodig (DNS-instellingen gebeuren later, nu blijft `contact@ontmoetenaandedonge.nl` als afzender).

---

## 2. Volledige bedrijven/contacten lijst

### Diagnose
Beide selectors snijden de lijst af op 100 items:
- `src/components/quotation/CompanySelector.tsx` regel 60: `companies.slice(0, 100)`
- `src/components/quotation/ContactSelector.tsx` regel 56: `filteredContacts.slice(0, 100)`

Daardoor zie je alleen de eerste 100 bedrijven/contacten. Bij honderden CRM-records ontbreekt de rest volledig.

Bovendien gebruikt `CompanySelector` een eigen Supabase-query zonder paginering, wat bij >1000 bedrijven óók tegen de Supabase 1000-row limit aanloopt.

### Aanpassingen

**A. `src/components/quotation/CompanySelector.tsx`**
- Verwijder `slice(0, 100)` — render alle resultaten (Command-component is virtueel geoptimaliseerd).
- Vervang de directe Supabase-query door de `CompaniesContext` (die al paginerend álle bedrijven laadt, net als `ContactsContext` voor contacten).

**B. `src/components/quotation/ContactSelector.tsx`**
- Verwijder `slice(0, 100)` — `useContactsContext()` levert al de volledige gepagineerde lijst.

**C. `src/contexts/CompaniesContext.tsx`** (controleren — naar verwachting al aanwezig)
- Indien nog niet: gepagineerd ophalen zoals in `ContactsContext` (1000 per batch). Zo niet, dan deze context gebruiken in `CompanySelector`.

---

## Technische details

| Bestand | Wijziging |
|---|---|
| `src/pages/PublicQuotePage.tsx` | `DocumentViewer` → `TemplatePreview` met `pdfUrl` en `overlayFields` |
| `supabase/functions/generate-quote-pdf/index.ts` | Fallback `pdfBackgroundUrl`/`editorPdfUrl` bij template-lookup |
| `src/components/quotation/CompanySelector.tsx` | `useCompaniesContext()` gebruiken, `slice(0, 100)` weg |
| `src/components/quotation/ContactSelector.tsx` | `slice(0, 100)` verwijderen |
| `src/contexts/CompaniesContext.tsx` | Paginering toevoegen indien nodig |

**Geen wijzigingen** aan database schema, e-mail-infrastructuur of DNS — die volgen later.

**E-mail nu**: blijft via de huidige Lovable Email setup met `contact@ontmoetenaandedonge.nl` als afzender; PDF-bijlage werkt zodra de PDF-fallbacks zijn geïmplementeerd.

