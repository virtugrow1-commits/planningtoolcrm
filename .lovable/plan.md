## Doel
Op de aanvraagpagina een "Opties"-kaart tonen (zelfde stijl als op de bedrijfskaart), zodat direct zichtbaar is of er al een optie in het systeem staat, en er snel een nieuwe optie aangemaakt of geopend kan worden.

## Wijzigingen

**`src/pages/InquiryDetailPage.tsx`**
- Nieuwe `optionBookings` memo: filter `bookings` op `status === 'option'` gekoppeld aan deze aanvraag via `contactId`, `companyId`, of naam-match (zelfde logica als de bestaande detectie voor `existingOption`), maar dan de volledige lijst i.p.v. één resultaat.
- Boven "Historie" een nieuwe sectie renderen met dezelfde kaartopmaak als op `CompanyDetailPage`:
  - Titel "Opties" met aantal-badge.
  - "+"-knop → opent de bestaande "Optie maken"-dialog (`setReservationStatus('option'); setShowReservationDialog(true)`).
  - "Bekijk agenda"-link → navigeert naar `/calendar`.
  - Bij lege lijst: "Geen opties".
  - Bij items: rijen met titel, ruimte, datum + tijd, klikbaar naar `/reserveringen/:id`.

## Uit scope
- Geen wijziging aan `InquiryDetailsTab` of de bestaande "Optie maken"-knop bovenaan; die blijft staan.
- Geen backend/schema-wijzigingen.
