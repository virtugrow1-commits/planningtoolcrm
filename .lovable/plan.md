

## Doel

De ~2200 ontbrekende taken uit `tasks-3.csv` toevoegen aan het CRM, gekoppeld aan de juiste contactpersonen, zonder duplicaten.

---

## Aanpak

### 1. Nieuwe DB-kolom: `legacy_task_id`
- Voeg kolom `legacy_task_id INTEGER UNIQUE NULL` toe aan `tasks` tabel.
- Doel: voorkomt duplicaten bij nu en bij toekomstige re-imports — als de legacy ID al bestaat, wordt de rij overgeslagen.

### 2. Nieuwe import-component: `LegacyTaskImport`
Toegevoegd aan **Instellingen → Beheer**, naast de bestaande `LegacyImport`-knop.

**Vereiste uploads (5 bestanden):**
| Bestand | Doel |
|---|---|
| `tasks-3.csv` | De taken zelf |
| `contacts_1.csv` | Mapping legacy `contact_id` → naam |
| `contact_data_1.csv` | EAV-data (voornaam, achternaam, e-mail) |
| `customers_2.csv` | Mapping legacy `customer_id` → bedrijf/particulier |
| `customer_data_1.csv` | EAV-data (bedrijfsnaam, e-mail) |

### 3. Verwerkingslogica

**Stap A — Bouw legacy → CRM mappings**
- Reconstrueer voor elke legacy `contact_id` de volledige naam + e-mail (uit contact_data_1.csv).
- Reconstrueer voor elke legacy `customer_id` de naam (bedrijf óf particulier).
- Match deze namen/e-mails tegen de huidige `contacts`-tabel (al gepagineerd ophalen, alle 1000+ rijen).
- Match-volgorde: e-mail (exact) → volledige naam (case-insensitive) → voornaam+achternaam losse delen.
- Bouw `legacyContactId → crmContactUuid` map en `legacyCustomerId → crmCompanyUuid` map.

**Stap B — Import de taken**
Voor elke rij in `tasks-3.csv`:
- **Skip** als `legacy_task_id` al bestaat in de DB.
- **Map velden:**
  - `title` ← CSV `titel`
  - `description` ← CSV `notitie`
  - `due_date` ← CSV `datum` (YYYY-MM-DD format, al correct)
  - `status` ← `'completed'` als CSV status=`1`, anders `'open'`
  - `completed_at` ← `started_at` (indien aanwezig en status=1) of `now()` als status=1 zonder timestamp
  - `priority` ← `'normal'` (CSV heeft geen prioriteit)
  - `assigned_to` ← `'Iris Machielse'` (account_id=4) of `'Sjors Jochems'` (account_id=6)
  - `contact_id` ← uit mapping op CSV `contact_id`
  - `company_id` ← uit mapping op CSV `customer_id`
  - `legacy_task_id` ← CSV `id`

**Stap C — Insert in batches van 100**
- Voortgangsbalk per 100 rijen.
- Foutregels worden gelogd maar blokkeren de rest niet.

### 4. Resultaten-rapport
Na voltooiing toont het component:
- Totaal verwerkt
- Nieuw aangemaakt
- Overgeslagen (duplicaat)
- Aantal gekoppeld aan contact
- Aantal gekoppeld aan bedrijf
- Aantal zonder koppeling (handmatig op te lossen)

---

## Technische details

| Bestand / migratie | Wijziging |
|---|---|
| **DB-migratie** | `ALTER TABLE tasks ADD COLUMN legacy_task_id INTEGER`; partial UNIQUE index op `(user_id, legacy_task_id) WHERE legacy_task_id IS NOT NULL` |
| `src/components/LegacyTaskImport.tsx` | **Nieuw**. Upload-UI + import-engine, hergebruikt `parseSemicolonCSV` patroon uit bestaande `LegacyImport` |
| `src/pages/SettingsPage.tsx` | Nieuwe sectie "Taken importeren uit legacy CRM" toegevoegd onder bestaande Legacy Import |

**Geen** wijzigingen aan: GHL-sync (geïmporteerde taken zijn lokaal-only, krijgen geen `ghl_task_id`), `tasks` types, andere imports. Bestaande taken blijven volledig intact.

**Belangrijke garanties:**
- Geen wijziging aan bestaande taken — alleen INSERT.
- Geen GHL-push tijdens bulk import (zou rate-limit raken). Als je later wil sync'en kan dat handmatig per taak.
- Taken zonder match krijgen nog steeds een rij (titel + notitie + datum) zodat geen historie verloren gaat — je kunt ze later via de UI aan een contact hangen.

