

## Doel

De boekingskaart in de dagweergave (DayGridView) overzichtelijker en duidelijker maken, met de **bedrijfsnaam** zichtbaar en betere typografie/hiërarchie.

---

## Wijzigingen

### Card-inhoud (nieuwe hiërarchie)

```text
┌─────────────────────────────────┐
│ ● Zakelijk overleg              │ ← titel, vetgedrukt
│   Acme B.V.                     │ ← bedrijfsnaam (NIEUW), accent kleur
│   Yvonne D'helft                │ ← contactpersoon
│   08:00 – 12:00 · 4u            │ ← tijd + duur
│   U-vorm · 12 gasten            │ ← opstelling + gasten (alleen indien >0)
└─────────────────────────────────┘
```

### Concrete verbeteringen

1. **Bedrijfsnaam toevoegen** — opgehaald via `booking.companyId` → `companies.find()` uit `useCompaniesContext()`. Wordt onder de titel getoond in de primaire accentkleur (warm bruin) zodat het visueel opvalt.

2. **"0 gasten" probleem oplossen** — alleen tonen als `guestCount > 0`. Geen lege "0" meer.

3. **Betere typografie**:
   - Titel: `text-[11px] font-bold` (was 10px semibold)
   - Bedrijfsnaam: `text-[10px] font-semibold text-primary`
   - Contact: `text-[10px]` met `User`-icoontje (4px)
   - Tijd: `text-[9px]` met `Clock`-icoontje, inclusief duur ("4u" of "1u 30m")
   - Opstelling/gasten: `text-[9px]` met scheidingsteken `·`

4. **Visuele structuur**:
   - Linker kleurbalk wordt iets dikker (4px ipv 3px) en krijgt `rounded-l-md`
   - Status-stip (●) toegevoegd vóór de titel: groen voor bevestigd, geel voor optie
   - Iets meer padding (`px-2 py-1` ipv `px-1.5 py-0.5`)
   - Subtiele `hover:shadow-md` voor klikbaarheid-feedback

5. **Adaptieve weergave op basis van hoogte** (verbeterde drempels):
   - Altijd: titel + status-stip
   - ≥ 28px: + bedrijfsnaam óf contactpersoon (afhankelijk van wat aanwezig is — bedrijf heeft voorrang als beide kort)
   - ≥ 40px: + tijd met duur
   - ≥ 56px: + zowel bedrijf als contact getoond
   - ≥ 70px: + opstelling/gasten

6. **GripVertical-icoon** verkleind en alleen zichtbaar bij hover (minder visuele ruis).

---

## Technische details

| Bestand | Wijziging |
|---|---|
| `src/components/calendar/DayGridView.tsx` | • `useCompaniesContext` importeren<br>• Companies map opbouwen voor O(1) lookup<br>• Card-render herstructureren met nieuwe hiërarchie<br>• `formatDuration(start, end)` helper toevoegen<br>• Status-stip + iconen (User, Clock van lucide-react)<br>• Drempelwaarden voor adaptieve weergave bijwerken<br>• `guestCount > 0` check |

**Geen** wijzigingen aan: type-definities (`Booking` heeft al `companyId`), data-fetching, week/maand views (alleen dagweergave is te klein/onleesbaar nu), drag-and-drop logica.

**Edge cases:**
- Geen `companyId`: bedrijfsregel wordt overgeslagen (geen lege regel).
- Lange bedrijfsnaam: `truncate` met tooltip (`title`-attribuut) zodat volledige naam zichtbaar bij hover.
- Korte boekingen (15–30 min): alleen titel + status-stip, geen overflow.

