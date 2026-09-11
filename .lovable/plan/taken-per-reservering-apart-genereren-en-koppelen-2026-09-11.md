# Taken per reservering apart genereren en koppelen

## Wat er nu gebeurt

De taken worden niet in CliqCRM gemaakt, maar komen uit GoHighLevel en hangen daar alleen aan de contactpersoon — nergens staat bij welke reservering ze horen. Twee dingen gaan daardoor mis:

1. **Tweede reeks komt niet binnen.** Bij het ophalen wordt een nieuwe taak overgeslagen als er voor dezelfde contactpersoon al een taak met dezelfde titel bestaat (bijv. "Factuur sturen"). De nieuwe taak wordt dan aan de oude, al afgeronde taak vastgeplakt in plaats van als nieuwe taak aangemaakt. Voor een terugkerende klant als Bliss Hypotheken betekent dat: geen nieuwe reeks.
2. **Dezelfde taken bij elke reservering.** Omdat een taak geen reservering kent, tonen aanvraag- en reserveringspagina's alle taken van de klant. Zo lijkt elke reservering dezelfde taken te hebben.

Bij Bliss Hypotheken staan drie reserveringen (8-9, 21-10, 12-11) en dertig taken op de contactpersoon, waarvan geen enkele aan een reservering gekoppeld is.

## Wat we gaan doen

1. **Taken niet meer wegfilteren op titel.** Elke taak uit GoHighLevel met een eigen kenmerk wordt voortaan als eigen taak binnengehaald. Alleen taken die echt al eerder zijn opgehaald worden bijgewerkt in plaats van gedupliceerd. Daarmee komt de tweede (en derde) reeks wél binnen.
2. **Taken automatisch aan de juiste reservering hangen.** Bij het binnenhalen zoeken we de reservering van dezelfde klant waarvan de datum het dichtst bij de taakdatum ligt, binnen een marge. Is er geen duidelijke match, dan blijft de taak bij de contactpersoon staan zonder reservering.
3. **Reservering en aanvraag tonen alleen hun eigen taken.** Het blokje "Taken" op de reserveringspagina en op de aanvraagpagina toont strikt de taken die aan die reservering of aanvraag hangen — geen losse klanttaken meer. Staan er nog geen taken, dan blijft het blok leeg met een duidelijke melding.
4. **Bestaande taken eenmalig toewijzen.** Voor de taken die er al staan draaien we dezelfde datumkoppeling eenmalig, zodat de historie meteen op de juiste reservering staat.

## Technische details

- `supabase/functions/ghl-auto-sync/index.ts`: `taskByContactAndTitle`-dedupe verwijderen (of beperken tot taken zonder `ghl_task_id`), zodat een nieuwe `ghl_task_id` altijd tot een insert leidt. Zelfde aanpassing controleren in de `sync-tasks`-actie van `ghl-sync/index.ts`.
- Nieuwe attributie-helper in `supabase/functions/_shared/`: kies uit de bookings van dezelfde `contact_id` (of `company_id`) de booking met de kleinste afstand tussen `bookings.date` en `tasks.due_date` binnen een venster van circa 45 dagen; bij gelijke afstand of leeg resultaat blijft `booking_id` null. Vul tegelijk `inquiry_id` uit `bookings.inquiry_id` wanneer aanwezig.
- Attributie toepassen bij insert én bij update van reeds gekoppelde taken waarvan `booking_id` nog null is.
- `src/pages/InquiryDetailPage.tsx` regel 110: contact-fallback in `inquiryTasks` verwijderen; strikt op `t.inquiryId === inquiry.id`. `BookingDetailPage.tsx` filtert al strikt op `bookingId` en blijft ongewijzigd.
- Eenmalige data-update (run_sql, geen schemawijziging) die dezelfde datumlogica in SQL toepast op bestaande taken met `booking_id is null`.
- Geen wijziging aan tabelstructuur; `tasks.booking_id` en `tasks.inquiry_id` bestaan al.

## Buiten scope

Als GoHighLevel voor een tweede reservering helemaal geen taken aanmaakt, kan CliqCRM ze ook niet ophalen. Na deze aanpassing zien we in de synclogboeken direct of er niets binnenkomt; dan ligt de oorzaak in de workflow in GoHighLevel.
