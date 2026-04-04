

## Plan: Documenten, Offertes en Facturen unificeren met GHL-synchronisatie

### Probleem
Er zijn nu drie losstaande systemen: GHL-documenten (read-only tabel), CRM-offertes en CRM-facturen. De gebruiker wil dat alles als een gecentraliseerd documentensysteem werkt, waarbij documenten zowel in GHL als in het CRM worden opgeslagen en bijgehouden.

### Aanpak

**Stap 1: Unified DocumentsPage als centraal overzicht**
De huidige `QuotesPage` wordt omgebouwd naar een gecombineerde "Documenten" pagina die alles toont:
- Tab "Alle documenten" - GHL-documenten + eigen offertes + eigen facturen in dezelfde tabelweergave (zoals de huidige DocumentsPage-stijl met status-badges, datums, bedragen, externe links)
- Tab "Offertes" - gefilterd op eigen offertes (met aanmaken-functionaliteit)
- Tab "Facturen" - gefilterd op eigen facturen
- Tab "Sjablonen" - bestaande sjabloon-functionaliteit
- De aparte DocumentsPage verdwijnt; alles komt samen

**Stap 2: Bidirectionele synchronisatie CRM → GHL**
Wanneer een offerte of factuur in het CRM wordt aangemaakt of bijgewerkt, wordt dit automatisch naar GHL gesynchroniseerd via de bestaande `ghl-sync` Edge Function:
- Nieuwe sync-actie `push-document` in `ghl-sync` die offertes/facturen naar GHL pusht via de GHL Documents/Estimates/Invoices API
- Bij statuswijzigingen (verzonden, bekeken, geaccepteerd, betaald) wordt de GHL-status mee-geüpdatet
- Het `ghl_opportunity_id` op offertes wordt gebruikt om documenten aan de juiste GHL-opportunity te koppelen

**Stap 3: GHL → CRM synchronisatie voor documenten**
De bestaande auto-sync wordt uitgebreid:
- Nieuwe functie `syncDocuments()` in `ghl-auto-sync` die documenten/voorstellen/facturen uit GHL ophaalt
- Inkomende GHL-documenten worden gematcht aan bestaande offertes/facturen via `ghl_document_id` of aangemaakt als losse documenten in de `documents` tabel
- Status-updates (bekeken, ondertekend) vanuit GHL worden overgenomen

**Stap 4: Webhook-ondersteuning voor realtime updates**
De `ghl-webhook` Edge Function wordt uitgebreid om document-events te verwerken:
- `DocumentSigned`, `DocumentViewed`, `InvoicePaid` events
- Status-updates worden direct doorgevoerd op de gekoppelde offerte/factuur

**Stap 5: Koppeling op detailpagina's**
- Contact-, bedrijfs- en aanvraagdetailpagina's tonen een gecombineerde "Documenten" sectie met zowel GHL-documenten als eigen offertes/facturen
- Externe GHL-link wordt altijd getoond zodat het document ook in GHL te openen is

### Technische details

**Database-wijzigingen:**
- Kolom `ghl_document_id` toevoegen aan `quotes` tabel (voor koppeling met GHL)
- Kolom `ghl_invoice_id` bestaat al op `invoices` tabel
- Geen nieuwe tabellen nodig; bestaande `documents`, `quotes` en `invoices` worden gecombineerd in de UI

**Bestanden die worden aangepast:**
- `src/pages/QuotesPage.tsx` - Unified overzicht met GHL-documenten erbij
- `src/pages/DocumentsPage.tsx` - Redirect naar unified pagina of verwijderen
- `src/hooks/useDocuments.ts` - Uitbreiden om ook quotes/invoices op te halen als unified view
- `supabase/functions/ghl-sync/index.ts` - Nieuwe `push-document` actie
- `supabase/functions/ghl-auto-sync/index.ts` - Nieuwe `syncDocuments()` functie
- `supabase/functions/ghl-webhook/index.ts` - Document-event handlers
- `src/components/AppLayout.tsx` - Navigatie aanpassen (1 menu-item i.p.v. 2)

**GHL API Endpoints die worden gebruikt:**
- `GET /documents/search` - Documenten ophalen
- `POST /documents` - Document aanmaken
- `PUT /documents/{id}` - Document updaten
- `GET /invoices` / `POST /invoices` - Facturen via GHL

