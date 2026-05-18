## Doel
De multi-select voor "Verantwoordelijke" (checkboxes voor Sjors / Iris, 1 taak per persoon) is nu alleen actief in de Nieuwe-taak-dialog op `TasksPage`. Op andere plaatsen staat nog een enkele dropdown. Doel: overal hetzelfde gedrag en dezelfde UI.

## Aan te passen plekken
1. `src/pages/Dashboard.tsx` — Nieuwe-taak-dialog (single Select)
2. `src/pages/InquiriesPage.tsx` — taak toevoegen bij aanvraag (regel ~1532)
3. `src/components/inquiry/InquiryTasksTab.tsx` — taak op aanvraag-detail
4. `src/components/detail/TasksSection.tsx` — taak op contact-/bedrijf-/booking-detail
5. `src/pages/TaskDetailPage.tsx` — "Vervolgtaak"-aanmaak (regel ~140)

## Aanpak
- Nieuwe herbruikbare component `src/components/TeamMemberMultiSelect.tsx`: popover met checkboxes voor Sjors Jochems + Iris Machielse, trigger toont "Sjors", "Iris" of "Sjors + Iris". Props: `value: string[]`, `onChange`, `placeholder`, `className`.
- In elk formulier hierboven:
  - `assignedTo` state wordt `string[]` (default `[]`, of huidige user voor follow-up).
  - Save-handler loopt over de array en roept per persoon `addTask({...})` aan met identieke velden.
  - Toast: enkelvoud bij 1 ("Taak aangemaakt"), meervoud bij meer ("X taken aangemaakt").
  - Validatie: leeg toegestaan (niemand toegewezen blijft mogelijk, net als nu) — tenzij user dat anders wil.
- `TasksPage` huidige inline-checkboxes vervangen door dezelfde nieuwe component voor consistentie.

## Niet-doelen
- Geen wijziging aan datamodel (`assignedTo` blijft `string` per taak — er worden meerdere taken aangemaakt).
- Geen wijziging aan filtering/lijstweergave.
- Bewerken van bestaande taak blijft single-select (`TeamMemberSelect`), omdat een bestaande taak één eigenaar heeft.

## Open vraag
Akkoord dat "geen verantwoordelijke" toegestaan blijft, of moet er minimaal 1 persoon gekozen worden?
