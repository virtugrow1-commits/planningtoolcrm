

## Plan: Tijdinvoer handmatig maken in NewBookingDialog

De `NewReservationDialog` en `BookingDetailDialog` gebruiken al `<Input type="time" />` waarmee je minuten kunt invoeren. Alleen `NewBookingDialog.tsx` gebruikt nog dropdown-selects met hele uren.

### Wat er verandert

**Bestand: `src/components/calendar/NewBookingDialog.tsx`**

1. **Interface uitbreiden** — `startMinute` en `endMinute` toevoegen aan `NewBookingForm`
2. **Select dropdowns vervangen** door `<Input type="time" />` velden (zelfde aanpak als NewReservationDialog)
3. De `HOURS` constante kan verwijderd worden (niet meer nodig)

### Technisch

- De twee `<Select>` componenten voor "Van" en "Tot" worden vervangen door `<Input type="time" value="HH:MM" onChange={...} />`
- De `onChange` handler splitst de waarde op `:` en zet `startHour`/`startMinute` en `endHour`/`endMinute`
- De `NewBookingForm` interface krijgt `startMinute: number` en `endMinute: number` erbij

**Let op**: alle plekken die `NewBookingForm` gebruiken moeten ook `startMinute`/`endMinute` meegeven. Dit wordt gecontroleerd en indien nodig aangepast.

