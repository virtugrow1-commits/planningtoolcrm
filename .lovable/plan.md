## Doel
Bestaande gespreksverslagen (en andere activiteiten) kunnen wijzigen/aanvullen — niet alleen toevoegen of verwijderen.

## Wijzigingen

### 1. `useContactActivities` hook (`src/hooks/useContactActivities.ts`)
Toevoegen: `updateActivity(id, { subject?, body?, type?, createdAt? })`
- Doet `supabase.from('contact_activities').update({...}).eq('id', id)`
- Bij succes: refetch + toast "Activiteit bijgewerkt"
- Exporteren naast `addActivity` / `deleteActivity`

### 2. `ActivityTimeline` (`src/components/contact/ActivityTimeline.tsx`)
- Per item een potlood-icoon (Pencil) naast Trash, zichtbaar op hover
- Klik opent dezelfde Dialog, maar in "edit"-modus: form pre-filled met bestaande `type/subject/body`
- Dialog-titel: "Activiteit bewerken" vs. "Activiteit toevoegen"
- Submit roept `updateActivity` (edit) of `addActivity` (nieuw) aan
- Voor Gespreksverslagen (subject === 'Gespreksverslag') blijft het subject vast — alleen body bewerkbaar; type-select verbergen voor deze entries

### 3. `TaskDetailPage` (`src/pages/TaskDetailPage.tsx`)
- "Eerdere verslagen bij deze taak"-lijst: potlood-knop toevoegen naast Trash
- Inline edit: klik op potlood → tekst vervangen door `Textarea` + datum-popover + Opslaan/Annuleren knoppen (zelfde stijl als nieuwe-verslag input)
- Opslaan roept nieuwe `updateActivity` aan (body + optioneel created_at), daarna `refetch` van `useTaskCallLogs`
- `useTaskCallLogs` krijgt zelfde `updateActivity` helper (delen via gemeenschappelijke util of via een directe supabase-call in de page is ook acceptabel — voorkeur: helper in hook hergebruiken)

## Niet-doelen
- Geen GHL-sync van edits (huidig gedrag bij delete is ook lokaal-first; sync van bewerkte notes valt buiten scope tenzij je het expliciet wilt)
- Geen schema-wijziging — `contact_activities` heeft al `updated_at`

## Bevestiging gevraagd
Wil je dat een bewerkt Gespreksverslag óók naar GHL gesynchroniseerd wordt (via `ghl_note_id` update-call), of is lokaal bijwerken voldoende?
