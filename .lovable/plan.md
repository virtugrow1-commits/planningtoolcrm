## Doel
1. Op de Taken-pagina meerdere taken in één keer kunnen selecteren en toewijzen aan één of meer gebruikers.
2. Bij het bewerken van een bestaande taak kunnen meerdere gebruikers gekozen worden (taak wordt dan gedupliceerd per extra gebruiker, consistent met "nieuwe taak").

## 1. Bulk-toewijzen op `src/pages/TasksPage.tsx`
- Checkbox-kolom toevoegen aan de takenlijst (header + per rij), plus "alles selecteren" voor de zichtbare/gefilterde set.
- State `selectedIds: string[]` bijhouden.
- Wanneer er ≥1 geselecteerd is, een **bulk-actiebalk** boven de lijst tonen met:
  - `TeamMemberMultiSelect` (Sjors / Iris)
  - Knop "Toewijzen" → past per geselecteerde taak `assignedTo` aan
  - Knop "Selectie wissen"
- Logica voor "Toewijzen":
  - 1 gebruiker gekozen → `updateTask` op elke geselecteerde taak met die `assignedTo`.
  - >1 gebruiker gekozen → eerste gebruiker krijgt de bestaande taak (update), voor elke extra gebruiker wordt de taak **gedupliceerd** via `addTask` (zelfde titel, beschrijving, prioriteit, dueDate, koppelingen).
- Toastmelding met aantal aangepaste / aangemaakte taken; selectie wissen na succes.

## 2. Multi-select bij taak bewerken in `src/pages/TaskDetailPage.tsx`
- In de bewerkmodus het huidige `TeamMemberSelect` (regel 332) vervangen door `TeamMemberMultiSelect`.
- `form.assignedTo` wordt intern in de edit-state `string[]` (initieel `[task.assignedTo].filter(Boolean)`).
- Bij opslaan (`handleSaveEdit` / equivalent):
  - Als 0 → validatie blokkeert opslaan (toast "Kies minimaal één verantwoordelijke").
  - Als 1 → normale `updateTask` met die naam.
  - Als >1 → huidige taak krijgt de eerste naam via `updateTask`; voor elke extra naam wordt een kopie aangemaakt via `addTask` met alle relevante velden (titel, omschrijving, status, prioriteit, dueDate, contactId/companyId/inquiryId/bookingId). Toast met aantal extra aangemaakte taken.
- Gespreksverslagen blijven aan de oorspronkelijke taak gekoppeld (niet meekopiëren).

## Niet binnen scope
- Geen wijzigingen aan datamodel (één `assigned_to` kolom per taak blijft). Multi-assign blijft "één taak per persoon" zoals al elders in de app.
- Geen wijzigingen aan GHL-sync logica.

## Bestanden
- `src/pages/TasksPage.tsx` — bulk selectie + actiebalk.
- `src/pages/TaskDetailPage.tsx` — multi-select in edit modus + dupliceer-logica bij opslaan.
- Hergebruik bestaande `src/components/TeamMemberMultiSelect.tsx`.
