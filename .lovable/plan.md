## Doel
Optioneel **tijd**-veld toevoegen aan taken. Bij het aanmaken/bewerken kun je naast de datum ook een tijd invullen. Taken worden gesorteerd op datum → tijd (met tijd bovenaan, zonder tijd daarna).

## Aanpak

### 1. Database
Nieuwe kolom `due_time` (type `time`, nullable) op `public.tasks`.

### 2. Types
- `src/types/task.ts` — `dueTime?: string` toevoegen (formaat `HH:mm`)
- `TasksContext.tsx` — mappen naar/uit `due_time` bij fetch/insert/update

### 3. UI — Aanmaakdialog & detail
- `src/pages/TasksPage.tsx` — extra `<Input type="time">` naast het datumveld in het nieuwe-taak-dialoog
- `src/pages/TaskDetailPage.tsx` — tijdveld tonen en bewerkbaar maken
- `src/components/inquiry/InquiryTasksTab.tsx` — tijd tonen naast datum als aanwezig

### 4. Weergave
Overal waar `📅 formatDate(task.dueDate)` staat, er `⏰ HH:mm` achter tonen als `dueTime` bestaat:
- `TasksPage.tsx` (lijst)
- `TasksSection.tsx` (detailpagina's contact/bedrijf/aanvraag)
- `KpiDetailDialog.tsx` (dashboard)
- `Dashboard.tsx` (widgets)

### 5. Sortering
In `TasksPage.tsx` bij `sortKey === 'dueDate'` en in `TasksSection.tsx`:
```
1. Datum oplopend
2. Binnen dezelfde datum: taken mét tijd op tijd oplopend
3. Taken zonder tijd onderaan die dag
4. Taken zonder datum helemaal onderaan
```

### Buiten scope
Niet aanpassen: offertes/facturen `dueDate` (die staan op `useInvoices`/`quotation.ts` en hebben geen tijd nodig).
