## Issues to fix

### 1. "Ja, nog één" knop doet niets
In `PostCompanyContactFlow.tsx` zit de bug: stap 3 (AlertDialog "Nog een toevoegen?") wordt gesloten via `setStep('form')`, maar Radix vuurt eerst `onOpenChange(false)` af → die roept `finish(false)` → hele flow sluit voordat het formulier opent.

**Fix:** vlag `transitioning` introduceren. Wanneer "Ja, nog één" wordt geklikt eerst `transitioning=true`, dan `setStep('form')`, en `onOpenChange` van stap 3 negeert sluitingen wanneer `transitioning` true is. Zelfde patroon voor stap 1 → stap 2.

### 2. Extra velden in contactpersoon-formulier (na bedrijf aanmaken)
Toevoegen aan `PostCompanyContactFlow` formulier:
- Afdeling (`department`) — vrij tekstveld
- DMU — **dropdown**
- Functiegroep (`functionGroup`) — **dropdown**
- Functie (`jobTitle`) — vrij tekstveld (al beschikbaar in DB, alleen UI)
- Geboortedatum (`birthDate`) — **nieuw veld**, datepicker

### 3. DMU & Functiegroep dropdowns
De oude BUUT-waardes ontbreken nog. Ik bouw de dropdowns met een centrale lijst in `src/lib/contactOptions.ts` zodat ze later eenvoudig aangepast kunnen worden. Tijdelijke set (graag bevestigen / aanvullen na review):

- **DMU**: Beslisser, Beïnvloeder, Gebruiker, Inkoper, Gatekeeper, Initiator
- **Functiegroep**: Directie, Management, HR, Sales/Marketing, Finance, Office Management, Operations, IT, Inkoop, Overig

Dezelfde dropdowns worden ook toegepast op:
- `src/pages/CrmPage.tsx` (nieuw contact dialog)
- `src/pages/ContactDetailPage.tsx` (bewerken)

### 4. Geboortedatum als nieuw veld
- Migratie: `ALTER TABLE contacts ADD COLUMN birth_date date;`
- Type uitbreiding in `src/types/crm.ts`: `birthDate?: string`
- Mappen in `ContactsContext` (read + insert + update)
- UI in: `PostCompanyContactFlow`, CRM nieuw contact, `ContactDetailPage`
- Datepicker via shadcn `<Calendar>` in `<Popover>` (met `pointer-events-auto`)

### 5. Optie in planning verandert GHL-workflow status
Oorzaak: bij het aanmaken van een booking met `status='option'` pusht `ghl-sync push-booking` deze als appointment met `appointmentStatus: 'new'`. In GHL is een workflow geconfigureerd die bij dat event de opportunity-stage verandert. Die status wordt vervolgens via `ghl-webhook` teruggesynct naar de bijbehorende `inquiry`.

We kunnen de GHL-workflow niet uitzetten vanuit onze code, maar we kunnen de trigger ontkoppelen:

**Aanpak:** in `ghl-sync` `push-booking` voor opties:
- `appointmentStatus` zetten op `'confirmed'` (neutraliseert "nieuwe afspraak" workflow trigger)
- Een herkenbaar label in `notes` toevoegen: `[OPTIE — geen workflow update]` zodat in GHL zichtbaar blijft dat het een optie is
- Booking-record blijft lokaal `status='option'` (kalender en filters blijven werken)

**Tweede beveiliging** in `ghl-webhook` opportunity-stage handlers: wanneer een binnenkomende stage-wijziging overeenkomt met "Optie" stage en de gekoppelde `inquiry` heeft binnen 5 minuten een booking-create event in `sync_log`, dan negeren (echo-loop preventie, zelfde patroon als bestaande deduplication).

## Bestanden

| Bestand | Wijziging |
|---|---|
| `supabase/migrations/<new>.sql` | `ALTER TABLE contacts ADD COLUMN birth_date date` |
| `src/types/crm.ts` | `birthDate?: string` |
| `src/lib/contactOptions.ts` (nieuw) | DMU & Functiegroep constanten |
| `src/contexts/ContactsContext.tsx` | birth_date map in fetch/add/update |
| `src/components/company/PostCompanyContactFlow.tsx` | Bug fix `transitioning`, extra velden, dropdowns, datepicker |
| `src/pages/CrmPage.tsx` | DMU/Functiegroep als Select, geboortedatum veld |
| `src/pages/ContactDetailPage.tsx` | Idem voor bewerken |
| `supabase/functions/ghl-sync/index.ts` | Push option-bookings als `confirmed` met `[OPTIE]` label |
| `supabase/functions/ghl-webhook/index.ts` | Echo-loop guard voor opportunity stage updates die volgen op booking create |

## Open vraag
Graag de exacte BUUT dropdown-waardes voor **DMU** en **Functiegroep** doorgeven (screenshots zijn nog niet bijgevoegd). Tot die er zijn gebruik ik bovenstaande tijdelijke lijsten.
