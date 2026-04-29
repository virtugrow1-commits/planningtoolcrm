## Doel
Wanneer een Gespreksverslag bij een taak wordt opgeslagen, het verslag automatisch ook in GoHighLevel laten verschijnen — zichtbaar in de GHL contact-tijdlijn.

## Aanpak
GHL heeft een officieel **Notes-endpoint** (`POST /contacts/{contactId}/notes`). Notes verschijnen direct in de activiteitenfeed van het contact in GHL — exact wat hier gewenst is. Dit is robuuster dan een custom webhook en gebruikt dezelfde GHL-credentials die al actief zijn.

## Wijzigingen

### 1. Database: GHL ID bewaren op contact_activities
Migratie: kolom `ghl_note_id` (text, nullable) + index toevoegen aan `contact_activities`. Zo voorkomen we dubbele pushes en kunnen we later updaten/verwijderen syncen.

### 2. Edge function `ghl-sync` — nieuwe action `push-call-log`
Nieuwe handler die:
- `activity_id` ontvangt
- het record + gekoppeld contact + `ghl_contact_id` ophaalt
- een note aanmaakt via `POST /contacts/{ghlContactId}/notes` met:
  - `body`: `"📞 Gespreksverslag (datum)\n\n{verslag}\n\n— Gekoppeld aan taak: {taak titel}"`
  - `userId` indien beschikbaar
- bij succes `ghl_note_id` terugschrijft naar `contact_activities`
- bij update (al `ghl_note_id` aanwezig) `PUT /contacts/{contactId}/notes/{noteId}` gebruikt
- foutafhankelijk logt via bestaande `logSyncOperation` (entity_type: `'activity'`)
- de bekende benigne errors (Contact not found, rate-limit) volgens projectconventies negeert/queueut

### 3. Frontend: `TaskDetailPage.handleSaveCallLog`
Direct na succesvolle insert van het verslag:
```ts
const { data: inserted } = await supabase.from('contact_activities')
  .insert(payload).select('id').single();

// fire-and-forget naar GHL
supabase.functions.invoke('ghl-sync', {
  body: { action: 'push-call-log', activity_id: inserted.id }
});
```
- Toast aanpassen naar: *"Gespreksverslag opgeslagen en gesynchroniseerd met GoHighLevel"*
- Bij sync-fout: stille console-log (verslag is lokaal opgeslagen, GHL is best-effort) — conform bestaande patronen.

### 4. Verwijderen (optioneel maar logisch)
`handleDeleteCallLog` wordt uitgebreid: als `ghl_note_id` gezet is, eerst `DELETE /contacts/{contactId}/notes/{noteId}` aanroepen via een nieuwe action `delete-call-log` in `ghl-sync`. 404 wordt genegeerd (al weg in GHL).

## Bestanden
- **Migratie**: `contact_activities.ghl_note_id` toevoegen
- **Edit**: `supabase/functions/ghl-sync/index.ts` — twee nieuwe actions (`push-call-log`, `delete-call-log`)
- **Edit**: `src/pages/TaskDetailPage.tsx` — invoke na save + delete
- **Edit**: `src/integrations/supabase/types.ts` — automatisch bijgewerkt na migratie

## Niet in scope
- Inkomende sync van GHL-notes terug naar het CRM (eenrichting voldoet aan vraag).
- Webhook-receiver wijzigingen — niet nodig omdat we de GHL REST API gebruiken.
