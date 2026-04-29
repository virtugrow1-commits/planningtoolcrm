
# Plan: Bedrijf-flow uitbreiden + Gespreksverslag op taken

Twee onafhankelijke verbeteringen.

---

## 1. Na 'Nieuw Bedrijf' → contactpersoon-flow

Op dit moment: na opslaan van een nieuw bedrijf op `CompaniesPage` sluit het dialog en verschijn je weer op de bedrijvenlijst. Je moet zelf het bedrijf opzoeken om een contact toe te voegen.

**Nieuwe flow (alleen bij aanmaken, niet bij bewerken):**

```text
[Nieuw Bedrijf opslaan]
        ↓
"Bedrijf 'X' aangemaakt. Contactpersoon toevoegen?"
   [Nee, sluiten]    [Ja, contact toevoegen]
        ↓                    ↓
   bedrijfsoverzicht    [Contact-formulier: voornaam, achternaam, email, telefoon, functie]
                              ↓ Opslaan
                       Contact aangemaakt en gekoppeld aan bedrijf
                              ↓
                       "Nog een contactpersoon toevoegen?"
                          [Nee, klaar]   [Ja, nog één]
                                              ↓
                                         (formulier opnieuw, leeg)
```

- Werkt ook vanaf `CrmPage` "Nieuw Bedrijf"-dialoog (zelfde gedrag).
- Bij **bewerken** van een bestaand bedrijf verandert er niets.
- 'Nee, klaar' biedt optioneel een knop **'Naar bedrijfspagina'** zodat je direct naar `/companies/:id` kunt.

### Implementatie
- `src/pages/CompaniesPage.tsx`:
  - `addCompany` retourneert nu het nieuwe bedrijf-id nodig — kort kijken of `addCompany` in `CompaniesContext` de id teruggeeft (nu retourneert hij `SyncOutcome`). We laten hem aanvullend de aangemaakte company-row teruggeven (lichte refactor: `{ outcome, company }`), of we lezen de net-aangemaakte company op via name+createdAt fallback. **Voorkeur: signature uitbreiden** zodat we direct het id hebben.
  - Nieuwe state: `postCreateCompanyId`, `addContactOpen`, `addAnotherOpen`, `contactForm`.
  - Nieuwe `Dialog`s:
    1. AlertDialog "Contactpersoon toevoegen?" (ja/nee) — verschijnt na succesvolle create.
    2. Contact-formulier dialog (voornaam*, achternaam*, email, telefoon, functie).
    3. AlertDialog "Nog een contactpersoon toevoegen?" — na opslaan contact.
  - Gebruikt `useContactsContext().addContact` met `companyId: postCreateCompanyId` en `company: <bedrijfsnaam>`.
- `src/pages/CrmPage.tsx`: zelfde drie dialogen hergebruiken na de "Nieuw Bedrijf"-flow daar (kleine variant, dezelfde componenten/hooks).
- `src/contexts/CompaniesContext.tsx`: `addCompany` retour uitbreiden naar `{ outcome: SyncOutcome | null; companyId: string | null }` (backwards-compatible: bestaande callers gebruiken alleen `outcome`).

---

## 2. 'Gespreksverslag' veld op taken → opgeslagen onder Gesprekken

### Probleem
Verslagen worden nu in 'Omschrijving' getypt en raken zo verspreid. We willen ze als losse activiteit ('call'/gespreksverslag) bij de contactpersoon zien staan, met datum en koppeling naar de taak.

### UX (op `TaskDetailPage`, in zowel lees- als bewerkmodus)

Onder het bestaande veld **Omschrijving** komt een nieuw veld:

```text
┌─ Gespreksverslag ─────────────────────────────┐
│ [Textarea, leeg bij openen]                   │
│                                               │
│ Datum: [vandaag, kalender-popover]            │
│              [Annuleren] [Opslaan in Gesprekken]
└───────────────────────────────────────────────┘

Onder dat blok: lijst eerdere verslagen voor deze taak
  • 28 apr 2026 — "Klant wil ander tijdslot..."  [verwijderen]
  • 22 apr 2026 — "..."
```

Belangrijk:
- Het is een **aparte actie** ("Opslaan in Gesprekken"), niet onderdeel van het taak-formulier zelf. Zo blijft `Omschrijving` bewust dingen ánders.
- Opslaan vereist een gekoppeld contactpersoon op de taak (`task.contactId`). Anders tonen we een hint: *"Koppel eerst een contactpersoon aan deze taak om een gespreksverslag te bewaren."*
- Na opslaan: textarea leeg, toast "Gespreksverslag toegevoegd aan gesprekken", lijst ververst.
- De lijst toont **alleen** verslagen die aan deze taak gekoppeld zijn (filter op `related_task_id`).

### Waar verschijnt het verder?
- Op de **contactpersoon-detailpagina** (`ContactDetailPage` / `ActivityTimeline`) verschijnen deze regels al automatisch via bestaande `contact_activities` realtime — extra label "Gespreksverslag" (i.p.v. generieke "Notitie") wanneer `type='call'` met subject `Gespreksverslag`.
- Op de **bedrijf-tijdlijn** (`CompanyActivityTimeline`) verschijnt het ook automatisch (aggregeert al via gekoppelde contacten).

### Datamodel
We hergebruiken bestaande `contact_activities`-tabel. Eén kleine schema-toevoeging om naar de taak te kunnen verwijzen:

```sql
alter table public.contact_activities
  add column if not exists related_task_id uuid;

create index if not exists idx_contact_activities_related_task_id
  on public.contact_activities(related_task_id);
```

- `type` = `'call'`
- `subject` = `'Gespreksverslag'`
- `body` = vrije tekst van het verslag
- `related_task_id` = `task.id`
- `created_at` = automatisch (datum); kalender-veld in UI overschrijft dit alleen als gebruiker handmatig een andere datum kiest (anders `now()`).

Geen wijziging aan `tasks`-tabel nodig — verslagen leven los, zodat de taak ze niet "bezit" en ze beschikbaar blijven als de taak ooit wordt gearchiveerd.

### Implementatie
- **Migratie** (1 kolom + index, zoals hierboven).
- `src/hooks/useContactActivities.ts`:
  - `addActivity` accepteert optioneel `relatedTaskId` en `createdAt`.
  - Nieuwe selector/filter: `useTaskCallLogs(taskId)` (eenvoudige hook of `select` met `eq('related_task_id', taskId)`), of het laden inline in `TaskDetailPage`.
- `src/pages/TaskDetailPage.tsx`:
  - Nieuwe sectie **"Gespreksverslag"** onder Taakgegevens (in zowel lees- als bewerkmodus zichtbaar).
  - State: `callLogText`, `callLogDate`, `savingCallLog`, lijst `taskCallLogs`.
  - Knop **"Opslaan in Gesprekken"** → roept `addActivity({ type: 'call', subject: 'Gespreksverslag', body: callLogText, relatedTaskId: task.id, createdAt: callLogDate })` met `contactId = task.contactId`.
  - Lijst verslagen voor deze taak eronder (datum + tekst, knop verwijderen).
- `src/components/contact/ActivityTimeline.tsx`: kleine cosmetische check zodat regels met `subject='Gespreksverslag'` als zodanig getoond worden (icoon telefoon, badge "Gespreksverslag").

---

## Out of scope
- Geen wijzigingen aan GHL-sync (gespreksverslagen blijven lokaal, net als bestaande notes).
- Geen migratie van bestaande tekst uit `tasks.description` — dit is een verbetering vooruit, oude gegevens blijven staan waar ze staan.
- Geen wijziging aan bewerk-flow van bestaande bedrijven (alleen bij **nieuw aanmaken**).

## Bestanden die wijzigen
- `src/pages/CompaniesPage.tsx` (nieuwe dialogen na create)
- `src/pages/CrmPage.tsx` (zelfde dialogen na "Nieuw Bedrijf")
- `src/contexts/CompaniesContext.tsx` (addCompany retour uitbreiden)
- `src/pages/TaskDetailPage.tsx` (gespreksverslag-sectie)
- `src/hooks/useContactActivities.ts` (relatedTaskId support)
- `src/components/contact/ActivityTimeline.tsx` (label/icoon voor 'Gespreksverslag')
- DB-migratie: `contact_activities.related_task_id`
