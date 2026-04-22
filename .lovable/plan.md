

## Doel — Grondige test & bugfixes

Ik heb een complete audit uitgevoerd. Hieronder de gevonden problemen, gegroepeerd op prioriteit, en de fixes per onderdeel.

---

## 🔴 Kritieke problemen (data-integriteit)

### 1. `room_settings` heeft DUBBELE rijen (16 ipv 8)
Elke ruimte staat 2x: één keer met de juiste `max_guests` (15, 30, 50…) en één keer met `max_guests: 0`. Gevolg:
- De sync-code `select('room_name, ghl_calendar_id')` haalt 16 rijen op → de mapping `roomToCalId` wordt 2x overschreven (laatste wint).
- Conflictdetectie kan dubbel triggeren.
- Capaciteitswaarschuwingen zijn onbetrouwbaar.

**Fix:** SQL-migratie die per `(room_name, ghl_calendar_id)` de rij met de hoogste `max_guests` behoudt en de rest verwijdert. Plus een UNIQUE-constraint op `(user_id, room_name)` zodat het niet opnieuw kan gebeuren.

### 2. Bookings worden NIET opgehaald uit GHL (`bookings_pulled: 0` bij elke sync)
Dit verklaart de gemelde ontbrekende reserveringen (Praktijksteun, Reanimatiecursus). Twee oorzaken:
- **`syncCalendar` draait alleen in `full` sync** (1x per uur), niet in light sync (elke 30 min).
- **GHL geeft een lege events-array** wanneer de fetch-URL geen `userId` of geen `groupId` heeft. We moeten ook de `users`-endpoint of `groupId` meesturen.

**Fix:**
- `syncCalendar` ook in light sync uitvoeren (lichter pull-window: laatste 30 dagen).
- Loggen van het exacte aantal events per kalender in `sync_log` zodat we kunnen zien waar het mis gaat.
- Per kalender: eerst `groupId` ophalen via `/calendars/{id}` en die meesturen als de events-call leeg blijft.
- Pull-window standaard verruimen naar **180 dagen terug + 365 dagen vooruit**.

### 3. Sync-queue: 39 vastlopers
- 9 items "GHL kalender is inactief" — deze moeten **automatisch worden weggewerkt** (niet handmatig). Inactieve kalenders zijn een bekende state, geen fout.
- 30 items "Sync failed" met `retry_count = 5` (max bereikt) — dood gewicht in de wachtrij.

**Fix:**
- Migratie: `DELETE FROM sync_queue WHERE last_error LIKE '%kalender is inactief%' OR retry_count >= max_retries`.
- In `pushToGHL` (sync-helper): bij detectie "calendar inactive" of "calendar_inactive" response, **niet** in queue zetten — alleen loggen als info.

---

## 🟡 Functionele bugs

### 4. React-warning op Dashboard (`Function components cannot be given refs`)
De console toont continu deze warning bij elke render van Dashboard. Komt door een `<Dialog>` waar een functioneel component als `asChild`-trigger of vergelijkbaar wordt doorgegeven zonder `forwardRef`.

**Fix:** Component opsporen in `src/pages/Dashboard.tsx` (regel 81 — Dialog) en de child wrappen in een `forwardRef` of vervangen door een DOM-element.

### 5. TasksPage: ongebruikte `priorityFilter` state + `PRIORITY_RANK`
Restanten van de eerder verwijderde prioriteit-filter (regel 34, 47). Werkt wel maar veroorzaakt dead code en mogelijke dependency-warnings.

**Fix:** Opruimen.

### 6. Booking duplicate-check te strikt
Bij `existingBookings` wordt alleen vergeleken op `ghl_event_id`. Bookings die handmatig zijn aangemaakt en daarna toch in GHL verschijnen (zelfde tijd/ruimte/contact) worden dubbel ingevoerd.

**Fix:** Extra fallback-match op `(date + start_hour + room_name + contact_name)` voor het inserten van nieuwe events.

---

## 🟢 Verbeteringen / robuustheid

### 7. Sync-statuspagina niet duidelijk genoeg
De `SyncQueuePanel` toont fouten maar niet de **succesvolle pulls** per ruimte. Geen inzicht in "wat is er deze sync binnengekomen".

**Fix:** Per sync-run het detail-veld uitbreiden met `events_per_calendar: { "Vergaderzaal 1.03": 12, ... }` en zichtbaar maken in `SettingsPage`.

### 8. `syncCalendar` foutmeldingen worden geslikt
Bij een 4xx-fout op `/calendars/events` gaat hij stilletjes door (`break`). Geen sync_log entry.

**Fix:** Bij elke non-2xx een sync_log entry met `entity_type='calendar'` en de status_code + body.

---

## Technische details

| Bestand / Migratie | Wijziging |
|---|---|
| **DB-migratie** | Dedupliceer `room_settings`, voeg UNIQUE-constraint toe, ruim sync_queue op |
| `supabase/functions/ghl-auto-sync/index.ts` | `syncCalendar` ook in light sync, pull-window 180d/365d, per-kalender logging, fallback duplicate-detect, foutmeldingen loggen |
| `src/lib/ghlSync.ts` | "calendar inactive" antwoorden niet in queue zetten |
| `src/pages/Dashboard.tsx` | forwardRef-warning oplossen op Dialog (regel ~81) |
| `src/pages/TasksPage.tsx` | Dead code (`priorityFilter`, `PRIORITY_RANK`) verwijderen |
| `src/components/SyncQueuePanel.tsx` | Tonen events_per_calendar uit laatste sync |

**Geen wijzigingen** aan: edge functions `ghl-sync` (recent gefixt), authenticatie, RLS policies, database schema (alleen data-cleanup).

**Aanpak na approval:** ik voer eerst de DB-migratie uit (data-cleanup), daarna de edge function deploy, daarna de frontend-fixes. Tot slot een handmatige sync triggeren en verifiëren dat ontbrekende bookings binnenkomen en de queue leeg is.

