

## Diagnose: Waarom reserveringen niet in GHL verschijnen

### Gevonden problemen

**1. GHL Kalender Type Mismatch (BLOCKER)**
De edge function logs tonen twee fouten voor elke boeking:
- Appointments endpoint: `"The slot you have selected is no longer available"` — GHL service-kalenders vereisen beschikbare slots
- Block-slots fallback: `"The calendar is not an event calendar"` — block-slots werkt alleen op event-kalenders

Dit betekent dat de GHL-kalenders zijn ingesteld als **service calendars**, maar de code probeert ze te gebruiken als event calendars. Geen van beide API-methoden werkt hierdoor.

**2. Dubbele room_settings records**
Elke ruimte staat **2x** in de `room_settings` tabel (bijv. "Keuken / Kookstudio" x2, "Vergaderzaal 100" x2). Dit kan onverwacht gedrag veroorzaken bij lookups.

**3. Queue wordt niet automatisch verwerkt**
Er staan **17 items** op `pending` met `retry_count: 0`. Er is geen cron/trigger die `process-sync-queue` automatisch aanroept — items blijven oneindig in de queue staan.

### Plan

#### Stap 1: Fix GHL kalender API-aanroep
De GHL Appointments API v2 (`2021-04-15`) voor service calendars vereist dat je de `selectedTimezone` en `selectedSlot` meestuurt, OF je moet `calendarId` + `ignoreFreeSlotValidation: true` gebruiken (indien beschikbaar in jouw GHL plan).

**Oplossing:** Voeg `ignoreFreeSlotValidation: true` toe aan de appointment payload. Als dat niet werkt, schakel over naar de **GHL Calendar Events API v2021-07-28** met het `/calendars/events` endpoint in plaats van `/calendars/events/appointments`.

Concrete wijziging in `supabase/functions/ghl-sync/index.ts`:
- In `push-booking`: voeg `ignoreFreeSlotValidation: true` toe aan `eventPayload`
- Pas de fallback aan: als appointments faalt, probeer het generieke `/calendars/events` endpoint (POST) dat ook voor service calendars werkt
- Verwijder de block-slots fallback (werkt niet voor service calendars)

#### Stap 2: Verwijder dubbele room_settings
SQL migration om duplicaten op te ruimen — behoud 1 record per ruimte.

#### Stap 3: Fix queue replay voor alle entity types
De `process-sync-queue` mist replay-logica voor `inquiry` (create/update/delete), `task` (create), en `booking` (delete). Voeg deze toe zodat queue-items correct worden herverwerkt.

#### Stap 4: Voeg automatische queue verwerking toe
Optie A: Een database trigger die bij elke INSERT op `sync_queue` de Edge Function aanroept.
Optie B: De frontend retry-logica verbeteren zodat na een mislukte sync automatisch een retry wordt ingepland.

### Vereiste actie van jou
Voordat ik de code kan fixen, moet ik weten:

- Zijn de GHL kalenders ingesteld als **Service Calendar** of **Event Calendar**? Dit bepaalt welke API-aanroep correct is.
- Als het service calendars zijn: kun je ze in GHL omzetten naar **Event Calendars**? Dat is de makkelijkste fix.

### Bestanden die worden aangepast
- `supabase/functions/ghl-sync/index.ts` — fix appointment creation API calls + queue replay
- SQL migration — verwijder dubbele room_settings

