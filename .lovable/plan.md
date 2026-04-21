

## Doel

Twee verbeteringen voor snellere boekingen vanuit aanvragen:

1. **Directe "Maak optie"-knop** op de aanvraagpagina — één klik om een optie aan te maken zonder opnieuw bedrijf/contact/datum in te voeren.
2. **Contactpersonen filteren op bedrijf** in alle nieuwe-dialoogvensters (Aanvraag, Reservering) — zodra een bedrijf is gekozen, worden alleen contacten van dat bedrijf getoond.

---

## 1. "Maak optie" knop op aanvraag

**Locatie:** `src/components/inquiry/InquiryDetailsTab.tsx` — naast de bestaande "Stadium wijzigen" knop in de actiebalk.

**Gedrag:** Opent `NewReservationDialog` (zoals nu met `onConvert`), maar vooringevuld met:
- `status: 'option'` (i.p.v. default `confirmed`)
- Alle prefill die al aanwezig is: titel, contact, bedrijf, datum, ruimte, gastenaantal, tijden
- Dialoogtitel dynamisch: "Nieuwe Optie" wanneer status=option, "Nieuwe Reservering" anders

**Wijzigingen:**
- `InquiryDetailsTab.tsx`: extra prop `onCreateOption` + tweede knop met kalender-icoon "Maak optie" naast "Stadium wijzigen".
- `InquiryDetailPage.tsx`: nieuwe state `optionMode` die wordt meegegeven aan `NewReservationDialog`. Na submit wordt de inquiry status naar `option` gezet (reeds bestaande logica dekt dit via `resForm.status === 'confirmed' ? 'reserved' : 'option'`).
- `NewReservationDialog.tsx`:
  - Nieuwe prop `initialStatus?: 'confirmed' | 'option'` (default `confirmed`).
  - Prefill gebruikt deze waarde voor `form.status`.
  - DialogTitle gebruikt `{initialStatus === 'option' ? 'Nieuwe Optie' : 'Nieuwe Reservering'}`.
  - Als prefill compleet is (contact + datum + tijd + ruimte) wordt gestart met dichte opmaak — geen extra wijziging nodig, bestaande prefill logica blijft werken.

---

## 2. Contactpersonen filteren op bedrijf

**Locaties:**
- `src/components/calendar/NewReservationDialog.tsx`
- `src/components/inquiry/NewInquiryDialog.tsx`

**Logica (beide dialogs):**

```text
contactOptions = companyId
  ? alleContacten.filter(c => c.companyId === companyId)
  : alleContacten
```

- Als er **geen** bedrijf is geselecteerd → volledige lijst (huidig gedrag).
- Zodra bedrijf wordt gekozen → lijst wordt direct beperkt tot contacten van dat bedrijf.
- Als het huidige `form.contactId` **niet** bij het nieuwe bedrijf hoort → contact automatisch resetten.
- Placeholder tekst wordt contextueel: *"Selecteer contact van {bedrijfsnaam}..."* wanneer gefilterd.
- Kleine hint-tekst onder combobox wanneer filter actief: *"Toont alleen contacten van {bedrijf}. Wis bedrijf om alle contacten te zien."*

**Edge case:** Als gebruiker eerst contact kiest en daarna bedrijf wijzigt naar één waar dit contact niet bij hoort → contact leegmaken en een subtiele toast/info tonen.

---

## Technische details

**Bestanden te wijzigen:**

| Bestand | Wijziging |
|---|---|
| `src/components/inquiry/InquiryDetailsTab.tsx` | Nieuwe prop `onCreateOption`, tweede knop toevoegen |
| `src/pages/InquiryDetailPage.tsx` | State `reservationStatus`, prop doorgeven aan `NewReservationDialog` |
| `src/components/calendar/NewReservationDialog.tsx` | Prop `initialStatus`, dynamische titel, contact-filter op companyId, auto-reset contact bij companywissel |
| `src/components/inquiry/NewInquiryDialog.tsx` | Contact-filter op companyId, auto-reset contact bij companywissel |

**Data-stroom Maak optie:**

```text
Aanvraag (alle data aanwezig)
   │
   ▼  klik "Maak optie"
NewReservationDialog met prefill + initialStatus='option'
   │
   ▼  gebruiker bevestigt tijden/ruimte
addBooking({ status: 'option', ... })
   │
   ▼
inquiry.status → 'option'
```

Geen database- of RLS-wijzigingen nodig. Geen nieuwe dependencies.

