

## Plan: Fix FontPicker dropdown die niet werkt

Het probleem is dat de FontPicker dropdown wordt afgekapt door parent containers met `overflow: hidden` (met name de `BlockEditor` wrapper op regel 107 en de Rnd component). De dropdown opent binnen deze containers en wordt daardoor niet zichtbaar.

### Oplossing

**Bestand: `src/components/template-editor/FontPicker.tsx`**

- De dropdown renderen via een **React Portal** (`ReactDOM.createPortal`) zodat deze buiten de overflow-hidden containers verschijnt
- De positie van de dropdown berekenen op basis van de trigger-knop positie (`getBoundingClientRect`)
- De dropdown wordt direct aan `document.body` toegevoegd met een vaste positie (`position: fixed`)

Dit is een beproefde aanpak die ook door Radix UI (Select, Popover etc.) wordt gebruikt om dropdown-problemen in geneste containers op te lossen.

### Technisch

- Import `createPortal` uit `react-dom`
- Bij het openen van de dropdown: bereken de positie van de trigger-knop
- Render de dropdown-lijst via `createPortal(dropdownJSX, document.body)` met `position: fixed` en de berekende `top`/`left` waarden
- Bestaande functionaliteit (font selectie, upload, verwijderen) blijft ongewijzigd

### Bestanden

- `src/components/template-editor/FontPicker.tsx` — Portal-rendering toevoegen voor de dropdown

