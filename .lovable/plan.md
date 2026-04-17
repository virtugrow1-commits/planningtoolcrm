
De gebruiker wil:
1. Een nieuwe "Taken" pagina in het hoofdmenu naast Dashboard met een overzicht van ALLE taken
2. Op het Dashboard alleen taken tonen die voor de ingelogde gebruiker (verantwoordelijke) zijn, gefilterd/gesorteerd op datum (wat vandaag/binnenkort moet gebeuren)

Ik moet kijken naar:
- AppLayout (al gezien) — navItemDefs uitbreiden
- Dashboard.tsx — bekijken hoe taken nu getoond worden
- Bestaande TasksContext — al beschikbaar
- LanguageContext voor vertaling 'nav.tasks'
- App.tsx voor routing
- Hoe wordt "huidige verantwoordelijke" bepaald? Profile display_name moet matchen met task.assigned_to (Sjors/Iris)

Belangrijke aandachtspunten:
- Assignees zijn strikt 'Sjors Jochems' en 'Iris Machielse' (memory)
- Dashboard moet filteren op huidige user → match via profile display_name → task.assigned_to
- Voor de overzichtspagina gebruiken we patroon van bestaande pagina's (bijv. InquiriesPage stijl)

## Plan: Taken module in hoofdmenu + persoonlijke taken op Dashboard

### 1. Nieuwe pagina `src/pages/TasksPage.tsx`
Volledig taken-overzicht met:
- Tabel met kolommen: Titel, Verantwoordelijke, Prioriteit, Vervaldatum, Status, Gekoppeld aan (aanvraag/contact/bedrijf)
- Filters: status (open/afgerond), verantwoordelijke (Sjors/Iris/iedereen), prioriteit
- Zoekbalk op titel
- Sortering op vervaldatum (default) en prioriteit
- Klik op rij → navigeren naar bestaande `TaskDetailPage`
- Knop "Nieuwe taak" voor snelle aanmaak
- Gebruikt bestaande `useTasksContext()`

### 2. Routing & navigatie
- **`src/App.tsx`** — route `/tasks` → `TasksPage`
- **`src/components/AppLayout.tsx`** — `navItemDefs` uitbreiden met `{ to: '/tasks', icon: CheckSquare, key: 'nav.tasks' }` direct naast Dashboard
- **`src/contexts/LanguageContext.tsx`** — vertaling toevoegen `nav.tasks` → "Taken" / "Tasks"

### 3. Dashboard taken-widget (`src/pages/Dashboard.tsx`)
Toevoegen of aanpassen van een sectie "Mijn taken" die:
- Huidige user's `display_name` ophaalt uit `profiles` tabel (via `user.id`)
- Taken filtert waar `assignedTo === currentUserDisplayName` EN `status === 'open'`
- Sorteert op `dueDate` oplopend (taken zonder datum onderaan)
- Toont taken die vandaag/binnenkort vervallen bovenaan, met visuele indicator:
  - Rood: vervaldatum vandaag of in het verleden (achterstallig)
  - Oranje: binnen 3 dagen
  - Neutraal: later
- Maximaal ~10 taken; "Bekijk alle taken" link naar `/tasks`
- Checkbox om snel als afgerond te markeren

### Technisch

- Mapping huidige user → assignedTo: ophalen via `supabase.from('profiles').select('display_name').eq('id', user.id).single()`. Als display_name geen exacte match is met "Sjors Jochems" / "Iris Machielse", toon een lege staat met instructie.
- Geen nieuwe DB-tabellen nodig; `tasks` tabel + bestaande context volstaan.
- Realtime updates werken automatisch via bestaande `tasks-realtime` channel in TasksContext.

### Bestanden

- **Nieuw**: `src/pages/TasksPage.tsx`
- **Aangepast**: `src/App.tsx` (route)
- **Aangepast**: `src/components/AppLayout.tsx` (nav-item)
- **Aangepast**: `src/contexts/LanguageContext.tsx` (vertaling)
- **Aangepast**: `src/pages/Dashboard.tsx` (mijn-taken widget)
