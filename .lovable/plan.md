
## Doel

Zorgen dat wijzigingen aan **bedrijven** en **contactpersonen** direct naar VirtuGrow (GHL) gaan, lokaal bewaard blijven, en **nooit meer stilletjes verdwijnen** door de achtergrondsync.

## Waarschijnlijke oorzaak in de huidige code

Er zitten nu drie risicopunten in de sync-flow:

1. **Detailpagina’s tonen “opgeslagen” voordat de GHL-sync echt bevestigd is**  
   `updateContact` en `updateCompany` slaan lokaal op en doen daarna een fire-and-forget push.

2. **Inkomende auto-sync kan velden later weer leegmaken**  
   In `ghl-auto-sync` worden contact- en bedrijfsvelden vanuit GHL teruggeschreven, ook als GHL voor bepaalde velden `null`/lege waarden terugstuurt.

3. **Destructieve orphan-cleanup verwijdert contacten automatisch**  
   In `ghl-auto-sync` zit expliciete contact-verwijderlogica voor records die “niet gezien” worden in GHL. Dat is te gevaarlijk voor productie en past bij het gemelde gedrag dat data “na een tijd” verdwijnt.

---

## Aanpak

### 1. Maak handmatige CRM-bewerkingen leidend totdat sync bevestigd is
Ik voeg een duurzame beschermlaag toe voor **contacts** en **companies**:

- nieuwe sync-status velden op beide tabellen, bijvoorbeeld:
  - `pending_outbound_sync`
  - `last_local_edit_at`
  - `last_sync_error`
  - `last_synced_at`

Gedrag:
- zodra iemand een contact/bedrijf bewerkt, wordt het record lokaal opgeslagen met `pending_outbound_sync = true`
- daarna loopt de push naar GHL **meteen**
- bij succes: `pending_outbound_sync = false`, `last_synced_at = now()`
- bij fout: record blijft lokaal behouden, fout wordt opgeslagen, en de retry-queue neemt het over

Hiermee kan de achtergrondsync later **niet meer zomaar over een handmatige CRM-wijziging heen schrijven**.

### 2. Maak de bewaarflow synchroon en eerlijk in de UI
Voor `ContactsContext` en `CompaniesContext` wijzig ik de update-flow:

- niet langer “save + losse background push”
- maar:
  1. lokaal opslaan
  2. directe GHL push starten
  3. uitkomst expliciet teruggeven:
     - `gesynchroniseerd`
     - `in wachtrij voor retry`
     - `mislukt maar lokaal veilig opgeslagen`

Ook de toasts op `ContactDetailPage` en `CompanyDetailPage` worden hierop aangepast, zodat gebruikers nooit meer een vals gevoel krijgen dat alles al klaar is terwijl de externe sync nog mislukt is.

### 3. Stop alle destructieve auto-verwijdering van contacten
De huidige orphan-cleanup in `ghl-auto-sync` voor contacten haal ik uit de automatische flow.

Nieuwe regel:
- **auto-sync mag contacten of bedrijven niet automatisch verwijderen** puur omdat GHL ze tijdelijk niet terugstuurt
- hoogstens loggen/markeren als “verdacht” voor handmatige controle
- verwijderen mag alleen nog via een expliciete verwijderactie

Dit is de belangrijkste safeguard tegen “gegevens verdwijnen na verloop van tijd”.

### 4. Maak inkomende GHL-pulls niet-destructief
Ik pas de inbound sync in `ghl-auto-sync` aan zodat:

- lege/null GHL-waarden **geen bestaande CRM-data meer wissen**
- alleen velden met echte inhoud teruggeschreven worden
- handmatig bewerkte records met `pending_outbound_sync = true` niet overschreven mogen worden
- voor bedrijven hetzelfde geldt als voor contacten, zodat adres/e-mail/website/plaats niet later verdwijnen

Kort:
- GHL mag verrijken
- GHL mag niet leegtrekken
- GHL mag niet over niet-bevestigde lokale edits heen schrijven

### 5. Versterk de retry- en logginglaag
Ik maak de sync-uitkomst beter traceerbaar:

- `pushToGHL` geeft een rijkere status terug dan alleen `null`
- queue-replays werken de sync-status van het originele record ook bij
- `sync_log` krijgt duidelijkere details per contact/bedrijf-update
- in de instellingen/syncweergave wordt zichtbaar welke records nog wachten op retry

Zo is meteen zichtbaar of iets:
- direct gelukt is
- veilig in de wachtrij staat
- aandacht nodig heeft

### 6. Volledige audit van bestaande probleemgevallen
Na de codefix neem ik een eenmalige herstelstap mee:

- sync-log nalopen op eerdere automatische contact-verwijderingen
- bestaande queue/items met contact- en company-updates opnieuw beoordelen
- waar mogelijk verkeerde deletes of ontbrekende GHL-koppelingen herstellen
- een handmatige full sync draaien om de nieuwe logica te verifiëren zonder data te wissen

---

## Bestanden / onderdelen

| Bestand | Wijziging |
|---|---|
| `src/contexts/ContactsContext.tsx` | Save-flow van contacten ombouwen naar directe, statusbewuste sync |
| `src/contexts/CompaniesContext.tsx` | Save-flow van bedrijven idem |
| `src/lib/ghlSync.ts` | Returntype uitbreiden met sync-resultaat (`success/queued/error`) en betere queue-status |
| `src/pages/ContactDetailPage.tsx` | Success/error messaging aanpassen op echte sync-uitkomst |
| `src/pages/CompanyDetailPage.tsx` | Success/error messaging aanpassen op echte sync-uitkomst |
| `supabase/functions/ghl-sync/index.ts` | Na succesvolle push ook sync-status op contact/bedrijf bijwerken |
| `supabase/functions/ghl-auto-sync/index.ts` | Destructieve orphan-cleanup verwijderen, inbound sync niet-destructief maken, lokale pending edits beschermen |
| DB migratie | Nieuwe sync-status kolommen op `contacts` en `companies` |

---

## Technische regels die ik ga afdwingen

1. Een handmatige CRM-edit is leidend totdat de outbound sync bevestigd is.  
2. Auto-sync mag **nooit** een contact of bedrijf automatisch verwijderen.  
3. Lege GHL-velden mogen bestaande CRM-velden niet overschrijven.  
4. Een mislukte GHL-sync mag lokale data niet blokkeren of verliezen.  
5. De UI mag alleen “gesynchroniseerd” tonen als dat ook echt zo is.

---

## Verwacht resultaat

Na deze fix:

- wijzigingen aan contacten en bedrijven gaan **direct** richting GHL
- als GHL tijdelijk faalt, blijft de wijziging **veilig lokaal staan**
- de retry-queue pakt de sync opnieuw op
- achtergrondsync kan de gegevens niet meer later laten verdwijnen
- gebruikers zien duidelijk of iets echt gesynchroniseerd is of nog in de wachtrij staat
