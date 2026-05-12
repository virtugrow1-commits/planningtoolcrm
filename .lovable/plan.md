## Wijzigingen

### 1. CRM → Nieuwe contactpersoon: bedrijf als dropdown
In `src/pages/CrmPage.tsx` (regel ~438) staat momenteel een vrij `Input`-veld voor "Bedrijf". Vervangen door een doorzoekbaar dropdown (Combobox) op basis van bestaande bedrijven uit `useCompaniesContext()`.

- Gebruik het bestaande `CrmCombobox` component (al gebruikt voor andere selects in het project).
- Opties: alle bedrijven uit `companies`, gesorteerd op naam.
- Bij selectie: zet zowel `company` (naam) als `companyId` op het nieuwe contact, zodat de bestaande koppellogica direct werkt en de fallback-`find()` op regel 145-147 niet meer nodig is.
- Vrij invullen blijft mogelijk via "Nieuw bedrijf aanmaken" — als de gebruiker een naam typt die niet bestaat, tonen we onderaan de lijst een "+ Nieuw bedrijf 'X' aanmaken"-actie. Dit creëert eerst het bedrijf via `addCompany`, en koppelt de nieuwe `companyId` direct aan het contact (zelfde patroon als de inline-creation flow elders in de app).
- Voorbeeld "Jane den Haan – Stichting Mijzo": bedrijf wordt nu correct geselecteerd en de `companyId` koppeling staat meteen goed.

### 2. CRM → Taken: filter standaard op ingelogde gebruiker
In `src/pages/TasksPage.tsx`:

- Initialiseer `userFilter` met de displaynaam van de huidige gebruiker in plaats van `'__all__'`.
- Bron: `profiles.display_name` van de ingelogde user (via `useAuth()` + een kleine fetch of via bestaande `useTeamMembers` hook).
- Mapping: alleen "Sjors Jochems" of "Iris Machielse" zijn geldig (zie memory). Als de display_name exact matcht → die preselecteren; anders fallback `'__all__'`.
- Gebruiker kan handmatig terugschakelen naar "Alle gebruikers" — alleen de **default** verandert.
- Effect via `useEffect` op user load, alleen zetten als de filter nog niet handmatig veranderd is (vlag `userFilterTouched`).

## Bestanden
- `src/pages/CrmPage.tsx` — Bedrijf-input vervangen door Combobox in nieuw-contact dialog.
- `src/pages/TasksPage.tsx` — Default `userFilter` op ingelogde gebruiker.

Geen database- of edge-function-wijzigingen nodig.