## Plan

Ik pas dit overal consequent aan, niet alleen in één scherm.

### 1. Bestaande data opschonen
- Alle bestaande contactnamen bijwerken:
  - `contacts.first_name`
  - `contacts.last_name`
  - `contacts.company`
- Alle bestaande bedrijfsnamen bijwerken:
  - `companies.name`
- Ook afgeleide opgeslagen namen bijwerken waar ze in kaarten/overzichten zichtbaar zijn:
  - `inquiries.contact_name`
  - `bookings.contact_name`
  - `quotes.contact_name`, `quotes.company_name`
  - `invoices.contact_name`, `invoices.company_name`
  - `documents.contact_name`, `documents.company_name`

### 2. Lijst met tussenvoegsels uitbreiden
Ik voeg in ieder geval `en` toe, plus de al gebruikte tussenvoegsels zoals:
`van`, `de`, `der`, `den`, `des`, `ten`, `ter`, `te`, `het`, `op`, `in`, `aan`, `bij`, `onder`, `over`, `uit`, `voor`, `tot`, `'t`, `'s`, `la`, `le`, `du`, `da`, `do`, `dos`, `das`, `di`, `del`, `della`, `von`, `zu`, `af`, `al`, `el`, `y`.

### 3. Nieuwe invoer blijvend goed opslaan
- De bestaande naam-normalisatie in de app wordt uitgebreid zodat `en` ook altijd lowercase wordt.
- Nieuwe contacten/bedrijven die handmatig worden aangemaakt blijven de zelf getypte hoofdletters behouden, behalve tussenvoegsels.

### 4. Backend-veiligheidsnet toevoegen
- Ik voeg een databasefunctie/trigger toe die bij nieuwe of gewijzigde contacten, bedrijven, aanvragen, reserveringen en documenten automatisch dezelfde tussenvoegsel-normalisatie toepast.
- Daardoor blijft dit ook goed bij import, sync of andere invoer buiten de handmatige schermen.

### Technische aanpak
- Nieuwe migration met een herbruikbare functie `normalize_dutch_name_particles(text)`.
- Data-update op alle relevante bestaande naamkolommen.
- Triggers op tabellen waar naamvelden worden opgeslagen.
- Kleine frontend-aanpassing in `src/lib/utils.ts` om `en` mee te nemen.