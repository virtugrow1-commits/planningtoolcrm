## Doel
Op de contactpersoon-detailpagina een **tag-dropdown** toevoegen (onder de naam) waarmee je snel tags kunt selecteren of nieuw kunt aanmaken. Geselecteerde tags zijn direct zichtbaar als chips zonder het menu te openen.

## Aanpak

### 1. Database
Nieuwe kolom `tags text[]` op `public.contacts` (default `'{}'`, nullable false).

### 2. Types / context
- `src/types/crm.ts` — `tags?: string[]` op `Contact`
- `src/contexts/ContactsContext.tsx` — mappen naar/uit `tags` bij fetch/insert/update

### 3. UI
Op `src/pages/ContactDetailPage.tsx`, in het linker zijbalk-kaartje net onder de naam (op de plek uit de screenshot):
- **Chips** van bestaande tags (kleine badges met een `×` om te verwijderen)
- **"+ Tag toevoegen"** knop die een popover opent met:
  - Een `Command` (shadcn Combobox) met alle unieke tags die al in de organisatie voorkomen (autosuggest)
  - Vrije invoer: bij Enter of "Nieuwe tag maken" komt de getypte waarde erbij
- Klik op een suggestie voegt hem toe; typen filtert; nieuwe waarden worden aangemaakt
- Duplicaten worden voorkomen (case-insensitive)

### 4. Waar tags nog zichtbaar maken
- Contactoverzicht (`src/pages/ContactsPage.tsx`, indien lijst) — chips achter naam. **Alleen als deze pagina in-scope is; anders overslaan.**

### Buiten scope
- Filteren/zoeken op tag (kan later)
- Tags bij bedrijven
