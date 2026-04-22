

## Doel

Zes verbeteringen aan de Takenpagina (`src/pages/TasksPage.tsx`) en gerelateerde detailweergaven om het takenbeheer voorspelbaarder en strikter te maken.

---

## Wijzigingen

### 1. Bulk-selectie van taken werkt niet
**Diagnose:** De checkbox bovenaan ("Alles selecteren") werkt, maar de individuele rij-checkboxes worden niet zichtbaar bijgewerkt omdat `<Checkbox onCheckedChange>` géén event meekrijgt en het klikken op de rij ergens anders ook navigeert. We zorgen dat:
- De checkbox-klik niet bubblet naar de rij (`onClick={e => e.stopPropagation()}` toevoegen op de Checkbox-wrapper).
- `selected` state wordt gerespecteerd bij re-render.

### 2. Verwijder optie "Niet toegewezen" uit filter
**Bestand:** `src/pages/TasksPage.tsx` regel 311
- `<SelectItem value="__none__">Niet toegewezen</SelectItem>` verwijderen uit de filter-dropdown.
- Logica voor `userFilter === '__none__'` (regel 127) verwijderen.
- Filter toont alleen: "Alle gebruikers", "Sjors Jochems", "Iris Machielse".

### 3. "Verantwoordelijke" verplicht maken bij nieuwe taak
**Bestand:** `src/pages/TasksPage.tsx` (formulier regel 540-550)
- Verwijder `__none__` / "Niemand"-optie.
- Default-waarde leeg laten met placeholder "Kies verantwoordelijke *".
- In `handleSave` (regel 179): blokkeer opslaan als `!form.assignedTo`, toon toast "Kies een verantwoordelijke".
- Label krijgt asterisk: `Verantwoordelijke *`.
- Knop "Opslaan" `disabled` zolang titel of verantwoordelijke leeg is.

### 4. Filter "Verantwoordelijke" blijft hangen op één gebruiker
**Diagnose:** De `Select`-component houdt zijn waarde, maar omdat `userFilter` als string-state wordt gebruikt zonder reset, lijkt het na de eerste keuze "vast te zitten" — vermoedelijk doordat het `value`-prop ontbreekt op de trigger placeholder. Fix:
- Voeg expliciete `placeholder` toe en zorg dat `<SelectValue>` gebruik maakt van `value={userFilter}` reactief.
- Reset selectie naar `__all__` werkt al via die optie. Extra: voeg key `key={userFilter}` toe aan `SelectContent` om re-mount af te dwingen indien nodig.
- Verifieer dat dezelfde fix nodig is voor `priorityFilter` en `statusFilter` — niet noodzakelijk volgens code, maar gelijk patroon aanhouden.

### 5. Knop "Prioriteit" verwijderen
**Twee plekken:**
- **Filterbalk** (regel 297-303): hele `<Select>` voor prioriteit weghalen. Sorteer-optie "Sorteer: Prioriteit" mag blijven (handig voor lijst-volgorde).
- **Nieuwe-taak-formulier** (regel 487-506): de prioriteit-`<Select>` weghalen; de grid wordt dan een enkele kolom voor "Status" — ook die wordt verwijderd (zie punt 6), dus de hele `grid grid-cols-2` met Status+Prioriteit verdwijnt.
- **Lijst-rij** (regel 396): `priorityIcon(task.priority)` weghalen zodat geen vlaggetjes meer verschijnen.
- **Sortering**: standaard `dueDate` blijft. De interne `priority`-veldwaarde blijft op `'normal'` voor alle nieuwe taken (geen DB-migratie nodig).

### 6. Status-veld verwijderen bij nieuwe taak
- **Formulier**: status-`<Select>` weghalen (regel 488-496).
- **`handleSave`**: hardcoded `status: 'open'` meegeven aan `addTask`.
- Status blijft wel zichtbaar/wijzigbaar in de lijst en op de detailpagina (om af te handelen).

---

## Technische details

| Bestand | Wijziging |
|---|---|
| `src/pages/TasksPage.tsx` | Filter "Niet toegewezen" weg, prioriteit-filter weg, prioriteit-icon weg, formulier zonder status/prioriteit, verantwoordelijke verplicht, checkbox stopPropagation, default `priority: 'normal'` & `status: 'open'` |

**Geen** wijzigingen nodig aan:
- `src/types/task.ts` — `priority` blijft bestaan (wordt elders nog gebruikt voor sortering en detailpagina).
- `src/contexts/TasksContext.tsx` — geen wijziging.
- DB-schema — kolommen blijven bestaan voor compatibiliteit met bestaande data en GHL-sync.

**Niet aangepast** in dit plan (kan later): de prioriteit/status weergave op `TaskDetailPage.tsx` — de gebruiker vroeg specifiek om deze velden weg te halen bij **nieuwe taken**, niet bij bestaande. Bestaande taken behouden hun prioriteit-info zichtbaar.

