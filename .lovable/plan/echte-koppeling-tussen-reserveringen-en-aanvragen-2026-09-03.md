# Echte koppeling tussen reserveringen en aanvragen

Nu wordt per aanvraagkaart geraden welke reserveringen erbij horen (op basis van contact en soms ook titel). Dat gebeurt op drie plekken met drie verschillende regels, dus je ziet niet overal hetzelfde. We leggen de koppeling echt vast.

## Wat er gebeurt

1. Reserveringen krijgen een echt veld "hoort bij aanvraag" (leeg toegestaan).
2. Maak je een reservering/optie aan vanuit een aanvraag, dan wordt die koppeling direct opgeslagen.
3. De drie verschillende manieren van tonen worden gelijkgetrokken: is er een echte koppeling, dan is die leidend; is die er niet, dan blijft de huidige contact-match werken.
4. Bestaande reserveringen worden in deze stap niet omgezet — die blijven werken via de contact-match.

## Technisch

**Migratie**
- `ALTER TABLE public.bookings ADD COLUMN inquiry_id uuid NULL REFERENCES public.inquiries(id) ON DELETE SET NULL;`
- `CREATE INDEX idx_bookings_inquiry_id ON public.bookings(inquiry_id);`
- Geen backfill, geen RLS-wijziging (bestaande policies op `bookings` blijven ongewijzigd).

**Types en data-laag**
- `src/types/crm.ts`: `Booking.inquiryId?: string`.
- `src/contexts/BookingsContext.tsx`: `inquiry_id` meenemen in de row-mapping (fetch, realtime, insert-return) en in `addBooking`, `addBookings`, `updateBooking` payloads (`inquiry_id: booking.inquiryId || null`).

**Aanmaken vanuit aanvraag**
- `NewReservationDialog`: `ReservationPrefill` uitbreiden met `inquiryId?`, meenemen in de form-state en teruggeven in de submit-payload (of doorgeven door de aanroeper).
- `src/pages/InquiryDetailPage.tsx` (regel ~397-440): `prefill.inquiryId = inquiry.id` en `inquiryId: inquiry.id` in de `addBooking`-call.
- Andere plekken waar vanuit een aanvraag een optie wordt gemaakt (statuswijziging naar optie / tegel-flow in `InquiriesPage.tsx`) idem: `inquiryId` meesturen.

**Filters gelijktrekken**
- Eén helper, bv. `src/lib/inquiryBookings.ts`:
  ```ts
  export const bookingsForInquiry = (bookings: Booking[], inq: Inquiry) => {
    const linked = bookings.filter(b => b.inquiryId === inq.id);
    if (linked.length) return sortByDate(linked);
    return sortByDate(bookings.filter(b =>
      !b.inquiryId && (
        (inq.contactId && b.contactId === inq.contactId) ||
        (!inq.contactId && b.contactName === inq.contactName)
      )
    ));
  };
  ```
- Vervangen in `src/pages/InquiriesPage.tsx` op regel ~146, ~197 (filter/sortering, waar nu ook `b.title === inq.eventType` meedoet) en ~633 en ~1198 (kaart en detailpaneel), zodat alle vier dezelfde uitkomst geven.
- `InquiryDetailPage.tsx` (`inquiryOptionBookings`, ~100) gebruikt dezelfde helper.

**Randvoorwaarden**
- Reserveringen zonder koppeling gedragen zich exact als nu.
- Een latere backfill-stap kan de bestaande 269 reserveringen alsnog koppelen; die valt buiten deze wijziging.
