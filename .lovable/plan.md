## 1. Taak voor meerdere gebruikers in 1× aanmaken (`src/pages/TasksPage.tsx`)
- "Verantwoordelijke"-veld in de Nieuwe-taak-dialog wordt een **multi-select** met checkboxes (Sjors Jochems, Iris Machielse).
- `form.assignedTo` wordt `string[]`.
- Validatie: minimaal 1 persoon geselecteerd.
- `handleSave` loopt door de geselecteerde namen en roept per persoon `addTask({...})` aan — dit creëert dus 1 taak per verantwoordelijke, met identieke titel/datum/koppelingen.
- Toast: "X taken aangemaakt" wanneer er meer dan 1 is.
- Bestaande takenlijst en filter blijven ongewijzigd (1 taak = 1 persoon, zoals nu).

Niet gewijzigd: andere plaatsen waar taken aangemaakt worden (InquiryTasksTab, vervolgtaak op TaskDetailPage). Wil je daar ook multi-assign? Standaard houd ik het beperkt tot de hoofd-Nieuwe-taak-dialog.

## 2. "Wijzigen"-knop voor Gespreksverslag zichtbaar maken
Het potlood-icoon is wél geïmplementeerd (in `ActivityTimeline` en in "Eerdere verslagen bij deze taak" op `TaskDetailPage`), maar staat op `opacity-0 group-hover:opacity-100` — alleen zichtbaar bij hover. Daardoor lijkt het te ontbreken.

Oplossing:
- Potlood- en prullenbak-knoppen **altijd zichtbaar** maken (geen opacity-toggle), in beide views:
  - `src/components/contact/ActivityTimeline.tsx`
  - `src/pages/TaskDetailPage.tsx` (lijst "Eerdere verslagen bij deze taak")
- Lichtgrijze styling zodat ze niet visueel domineren, maar wel meteen vindbaar zijn.

## Niet-doelen
- Geen wijziging aan datamodel/sync.
- Geen GHL-sync van bewerkte gespreksverslagen (zoals eerder afgesproken — alleen lokaal).
