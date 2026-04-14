

## Plan: Vervang "Omzetten naar Reservering" door Statuswijziging met Toelichting

De knop "Omzetten naar Reservering" op de aanvraag-detailpagina wordt vervangen door een dialoog waar je een nieuw stadium kunt kiezen en een verplichte reden/toelichting moet invullen.

### Wat er verandert

1. **Database: `status_reason` kolom toevoegen aan `inquiries` tabel**
   - SQL migratie: `ALTER TABLE public.inquiries ADD COLUMN status_reason text DEFAULT NULL;`

2. **Type aanpassen (`src/types/crm.ts`)**
   - `statusReason?: string` toevoegen aan de `Inquiry` interface

3. **InquiriesContext aanpassen (`src/contexts/InquiriesContext.tsx`)**
   - `status_reason` meenemen bij het ophalen en opslaan van aanvragen

4. **Nieuw component: `InquiryStatusChangeDialog`**
   - Vergelijkbaar met `OptionStatusChangeDialog` maar met alle inquiry-stadia als keuze
   - Verplicht veld voor reden/toelichting
   - Huidige status uitgesloten van de keuzelijst

5. **InquiryDetailsTab aanpassen**
   - "Omzetten naar Reservering" knop vervangen door "Stadium wijzigen" knop
   - Bij klik opent het `InquiryStatusChangeDialog`
   - Na bevestiging wordt de inquiry bijgewerkt met nieuw stadium + reden

6. **InquiryDetailPage aanpassen**
   - State en handler toevoegen voor het nieuwe dialoog
   - `onConvert` prop hernoemen/aanpassen naar `onStatusChange`
   - Toelichting tonen op de detailpagina als deze is ingevuld

### Technisch

- Het dialoog toont alle PIPELINE_COLUMNS behalve het huidige stadium
- De `statusReason` wordt opgeslagen in de database en getoond als InfoRow op de detailpagina
- De bestaande "Omzetten naar Reservering" (NewReservationDialog) blijft beschikbaar als aparte actie via de bewerkknop of kan later worden teruggezet indien gewenst

