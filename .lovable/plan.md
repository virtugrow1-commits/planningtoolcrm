## Doel

Maak "Gespreksverslag" overal duidelijk vindbaar, te wijzigen en op te slaan — zowel op **Taak**, **Contactpersoon** als **Bedrijf** — met consistente UI en betrouwbare GHL-sync.

## Huidige situatie (kort)

- **Taak**: dedicated paneel "Gespreksverslag" werkt (toevoegen, bewerken, verwijderen, GHL push/delete).
- **Contactpersoon**: gebruikt `ActivityTimeline` met algemene "Activiteit toevoegen" knop (kleine +). Een verslag toevoegen kan alleen indirect door type "Telefoongesprek" + onderwerp handmatig in te vullen — er is geen knop **"Gespreksverslag toevoegen"**. Edit/verwijder werkt, maar pusht **niet** naar GHL (alleen op de Taak-pagina).
- **Bedrijf**: `CompanyActivityTimeline` is **read-only** — geen toevoegen/bewerken/verwijderen mogelijk. Alleen aggregatie van verslagen van gekoppelde contacten.
- GHL-sync acties bestaan al: `push-call-log`, `delete-call-log`. Er is **geen update-sync** (bewerken pusht geen wijziging naar GHL).

## Wat we gaan doen

### 1. Gedeelde component: `CallLogPanel`
Nieuwe component `src/components/contact/CallLogPanel.tsx` met:
- Prominente sectie-header "Gespreksverslagen" (telefoon-icoon, primary kleur).
- **Editor** bovenin: textarea + datumkiezer + "Opslaan in Gesprekken" knop. Optioneel een contactselector (nodig op bedrijf-niveau).
- **Lijst** eronder: kaart per verslag met datum, tekst, en altijd zichtbare ✏️ en 🗑️ knoppen (geen hover-opacity).
- Inline bewerken (zelfde patroon als TaskDetailPage): textarea + datum + Annuleren/Opslaan.
- Roept bij elke actie (create/update/delete) de juiste GHL-sync aan (fire-and-forget).

### 2. GHL-sync uitbreiden
- Voeg `update-call-log` actie toe aan `supabase/functions/ghl-sync/index.ts`: als er een `ghl_note_id` bestaat, doe `PUT /contacts/{ghl_contact_id}/notes/{ghl_note_id}` met de nieuwe body; anders push nieuw (fallback naar bestaande push-call-log).
- Update `useContactActivities.updateActivity` en `useTaskCallLogs.updateLog` om na succesvolle DB-update de edge function aan te roepen.

### 3. Contactpersoon-pagina
- Vervang in `ContactDetailPage.tsx` de huidige `ActivityTimeline` door **twee duidelijk gescheiden secties**:
  - **"Gespreksverslagen"** (nieuwe `CallLogPanel`) — voor telefoongesprekken die het team voert.
  - **"Activiteiten / Notities"** (huidige `ActivityTimeline`, opgeschoond — verslagen worden uitgefilterd) — voor e-mails, vergaderingen, losse notities.
- Filtering: een rij is een "gespreksverslag" als `type='call' AND subject='Gespreksverslag'`.

### 4. Bedrijf-pagina
- Vervang `CompanyActivityTimeline` (read-only) door interactieve versie van `CallLogPanel`:
  - Editor verplicht een **contactpersoon-selector** (dropdown met gekoppelde contacten van het bedrijf) — want activiteiten hangen aan een contact.
  - Lijst toont alle verslagen van álle gekoppelde contacten, met contactnaam-badge per regel.
  - Edit/verwijder werkt org-breed (RLS staat dit al toe).

### 5. Taak-pagina
- Refactor het bestaande Gespreksverslag-blok in `TaskDetailPage.tsx` om `CallLogPanel` te gebruiken (met `relatedTaskId` vast ingevuld en contact verplicht-gekoppeld via de taak). Behoudt huidige functionaliteit; geen functionele wijziging voor de gebruiker.

### 6. Kleine UX-verbeteringen
- Lege staat met duidelijke call-to-action: *"Nog geen gespreksverslagen — leg het eerste gesprek vast."*
- Toast-feedback bij elke actie incl. "Wordt gesynchroniseerd met VirtuGrow…".
- Indicator (klein wolkje) per verslag of GHL-sync gelukt is (`ghl_note_id` aanwezig).

## Technische details

**Bestanden nieuw/aangepast:**
- `src/components/contact/CallLogPanel.tsx` (nieuw, herbruikbaar)
- `src/hooks/useContactActivities.ts` — `updateActivity` en `useTaskCallLogs.updateLog` roepen GHL-sync aan
- `src/components/contact/ActivityTimeline.tsx` — filter call-logs eruit, hernoem naar "Notities & activiteiten"
- `src/components/company/CompanyActivityTimeline.tsx` — vervangen door wrapper rond `CallLogPanel` (multi-contact modus)
- `src/pages/ContactDetailPage.tsx` — beide secties tonen
- `src/pages/CompanyDetailPage.tsx` — interactieve versie gebruiken
- `src/pages/TaskDetailPage.tsx` — refactor naar `CallLogPanel`
- `supabase/functions/ghl-sync/index.ts` — nieuwe action `update-call-log`

**Geen schema-wijzigingen nodig** — `contact_activities` heeft al `ghl_note_id`, `related_task_id`, `updated_at`.

**Compatibiliteit:** bestaande verslagen (type=call, subject=Gespreksverslag) blijven geldig en zichtbaar in nieuwe UI.