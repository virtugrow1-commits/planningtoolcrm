## Bestaand contact koppelen aan nieuw bedrijf

In de flow na het aanmaken van een bedrijf (`PostCompanyContactFlow.tsx`) staat momenteel alleen "Ja, contact toevoegen" (nieuw). We herstellen de mogelijkheid om een **bestaand** contact uit het CRM te koppelen.

### UI-wijzigingen (`src/components/company/PostCompanyContactFlow.tsx`)

**Stap 1 — "Contactpersoon toevoegen?"** krijgt drie knoppen in plaats van twee:
- `Nee, sluiten`
- `Bestaand contact koppelen` (nieuw)
- `Nieuw contact aanmaken`

**Nieuwe stap `link`** (getoond bij klik op "Bestaand contact koppelen"):
- Dialog met een `CrmCombobox` / zoekveld dat alle contacten uit `useContactsContext()` toont (naam + huidig bedrijf als hint).
- Bij selectie: `updateContact({...contact, company: newCompany.name, companyId: newCompany.id})` → toast "X gekoppeld aan {bedrijf}".
- Daarna door naar bestaande stap `another` ("Nog een contactpersoon toevoegen?"), waar de knop "Ja, nog één" een keuzemenu geeft (nieuw of bestaand) — simpelste: standaard terug naar stap 1.

**Stap 3 — "Nog een contactpersoon toevoegen?"** krijgt eveneens twee actieknoppen ("Nog nieuw" / "Nog bestaand koppelen") in plaats van één.

### Waarschuwing bij bestaand contact met ander bedrijf
Als het geselecteerde contact al een `companyId` heeft dat afwijkt, tonen we in de dialog een korte melding: *"Dit contact is nu gekoppeld aan {oud bedrijf}. Bij bevestigen wordt dit overschreven."*

### Buiten scope
- Geen wijzigingen aan `ContactsContext`, database of andere pagina's.
- Bulk-koppelen van meerdere contacten in één keer.
