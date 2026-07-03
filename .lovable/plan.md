## Doel
Contactpersonen met status **"Uit dienst"** verbergen in alle bedrijf-→contact selectielijsten in het systeem.

## Aanpassing
Overal waar contacten gefilterd worden op `companyId` óók filteren op `!c.departed`.

### Locaties
- `src/components/inquiry/NewInquiryDialog.tsx` (aanvraag aanmaken)
- `src/components/calendar/NewReservationDialog.tsx` (reservering aanmaken)
- `src/pages/TasksPage.tsx` (taak aanmaken)
- `src/pages/Dashboard.tsx` (snelle acties)
- `src/pages/InquiriesPage.tsx` (bewerken aanvraag, regel 1189)
- `src/components/quotation/ContactSelector.tsx` (offerte/factuur contact kiezen)

### Uitgesloten
- `CompanyDetailPage.tsx` — de contactlijst van het bedrijf zelf blijft "uit dienst" tonen (met grijze markering), zodat je die contacten nog kunt beheren.

### Detail
Filter wordt: `contacts.filter(c => c.companyId === X && !c.departed)`. Wanneer er geen bedrijf gekozen is blijft het volledige contactoverzicht van toepassing — daar filteren we óók `!c.departed` uit om consistent te zijn in de aanmaakdialogen.
