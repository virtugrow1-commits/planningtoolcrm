

## Doel

Vijf afzonderlijke verbeteringen om de app betrouwbaarder te maken voor dagelijks gebruik:

1. **Bedrijven los kunnen koppelen** aan documenten/offertes (zonder verplicht een contactpersoon te kiezen).
2. **Kalender-synchronisatie** verbeteren zodat ontbrekende reserveringen (zoals Praktijksteun en Reanimatiecursus) wel zichtbaar worden in de app.
3. **Vervolgtaak-dialoog**: keuzeveld "Verantwoordelijke" toevoegen (Sjors / Iris).
4. **Datum verplicht** maken bij vervolgtaken (en bij standaard taak-aanmaken).
5. **Zaalopstelling** consistent tonen in alle reserveringsweergaven (lijst, detail, kaart op kalender).

---

## 1. Bedrijven selecteren bij offertes/documenten

**Probleem:** In `NewQuotePage` is de `CompanySelector` al aanwezig, maar `ContactSelector` resette eerder de keuze. We zorgen dat:
- Een offerte opgeslagen kan worden met **alleen een bedrijf** (zonder contact).
- Het bedrijfsveld blijft staan ook als geen contact wordt gekozen.

**Bestanden:**
- `src/pages/NewQuotePage.tsx` — validatie aanpassen: minimaal één van (bedrijf | contact) verplicht in plaats van contact verplicht.
- `src/hooks/useQuotes.ts` / `src/types/quotation.ts` — `contactId` als optioneel behandelen.
- `src/pages/QuoteDetailPage.tsx` — fallback weergave: als geen contact, toon enkel bedrijfsnaam in de header en op de PDF.
- Merge tags: `{{contact.name}}` valt terug op bedrijfsnaam wanneer leeg.

---

## 2. Kalender-synchronisatie betrouwbaarder

**Diagnose:** De edge function `ghl-auto-sync` haalt events per kalender op (regel 304), maar:
- Kalenders met `isActive: false` worden volledig overgeslagen — afspraken in inactieve kalenders verschijnen niet.
- Het tijdvenster is `startDate = nu` — historische events van gisteren worden gemist bij een eerste sync na een tijdje.
- Er is geen retry bij timeouts/429.

**Aanpassingen `supabase/functions/ghl-auto-sync/index.ts`:**
- Pull-window verruimen: `startDate.setDate(now.getDate() - 14)` → laatste 14 dagen worden meegenomen.
- Inactieve kalenders **wel pullen** (alleen pushen blokkeren).
- Per kalender een retry met backoff bij 429/5xx.
- Forceer dat `evt.calendarId` zonder mapping toch een booking aanmaakt onder `evt.calendarName` als ruimtenaam (huidige code doet dit, maar valt soms op fallback "Ontmoeten Aan de Donge" — vervangen door `calendarName`).

**Handmatige sync-knop:** voeg in `SettingsPage` een knop "Synchroniseer kalender nu" toe die de edge function direct aanroept en het resultaat toont (aantal opgehaalde events).

---

## 3. Vervolgtaak-dialoog: keuzeveld "Verantwoordelijke"

**Bestand:** `src/pages/TaskDetailPage.tsx` (regel 353-397)

- Nieuw state-veld `followAssignedTo`.
- Voeg `<TeamMemberSelect />` toe naast prioriteit en datum.
- Default-waarde = `task.assignedTo` (zelfde verantwoordelijke als de oorspronkelijke taak).
- In `handleFollowUp` (regel 117): `assignedTo: followAssignedTo` meegeven aan `addTask`.

**Layout in dialog:**
```text
[ Taakomschrijving ........................................ ]
[ Prioriteit ▾ ] [ Verantwoordelijke ▾ ] [ 📅 Datum * ]
                                       Sluiten   Aanmaken
```

---

## 4. Datum verplicht maken

**Bestand:** `src/pages/TaskDetailPage.tsx`

- Knop "Aanmaken" `disabled` wanneer `!followTitle.trim() || !followDueDate`.
- Datumknop krijgt een rode rand wanneer leeg na een aanmaakpoging.
- Label "Datum *" met asterisk om verplichting visueel aan te geven.

**Consistentie:** ook `InquiryTasksTab.tsx` en de quick-add op de Tasks-pagina krijgen dezelfde verplichting (datum-veld toevoegen indien nog niet aanwezig).

---

## 5. Zaalopstelling tonen in alle weergaven

**Status:** Het veld `roomSetup` wordt al opgeslagen en is zichtbaar in `BookingDetailDialog` en `BookingDetailPage`, maar **niet** in:
- De reserveringen-lijst (`ReserveringenPage`).
- De compacte kalenderkaart (Day/Week/Month views).
- De voorbereidings-checklist.

**Aanpassingen:**
- `src/pages/ReserveringenPage.tsx` — kolom "Opstelling" toevoegen aan de tabel.
- `src/components/calendar/DayGridView.tsx` & `WeekView.tsx` & `MonthView.tsx` — als `roomSetup` aanwezig is, tonen als kleine regel onder de titel (bijv. `"U-vorm · 24 gasten"`).
- `src/pages/InquiryDetailPage.tsx` — bij linked bookings de opstelling tonen.

---

## Technische details

| Bestand | Wijziging |
|---|---|
| `src/pages/NewQuotePage.tsx` | Bedrijf-only flow toestaan, validatie aanpassen |
| `src/hooks/useQuotes.ts` | `contact_id` nullable bij insert/update |
| `src/pages/QuoteDetailPage.tsx` | Fallback-weergave header zonder contact |
| `supabase/functions/ghl-auto-sync/index.ts` | 14d pull-window, inactive kalenders pullen, retry backoff |
| `src/pages/SettingsPage.tsx` | Knop "Synchroniseer kalender nu" |
| `src/pages/TaskDetailPage.tsx` | Verantwoordelijke-veld + datum verplicht in vervolgtaak |
| `src/components/inquiry/InquiryTasksTab.tsx` | Datum verplicht maken bij quick-add |
| `src/pages/ReserveringenPage.tsx` | Kolom "Opstelling" |
| `src/components/calendar/DayGridView.tsx`, `WeekView.tsx`, `MonthView.tsx` | Zaalopstelling tonen op booking-kaart |
| `src/pages/InquiryDetailPage.tsx` | Opstelling bij gekoppelde reserveringen tonen |

Geen database-migraties nodig — alle velden bestaan al in `bookings.room_setup` en `quotes.contact_id` (al nullable). Geen nieuwe dependencies.

