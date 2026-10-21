# Hoofdletters: overnemen wat je typt, met een paar vaste naamregels

## Wat er nu misgaat
- Bij elke opslag past het systeem namen aan met een lange lijst "kleine woorden" (van, de, en, in, op, voor, over, la, le, al, y, ...).
- Die regel draait ook op **bedrijfsnamen** en **voornamen**, en ook op het **eerste woord**. Daardoor wordt bijvoorbeeld "Hotel De Kroon" → "Hotel de Kroon", "Bakker En Zn" → "Bakker en Zn", "Over De Brug BV" → "over de Brug BV".
- Een naam die met een kleine letter wordt getypt ("jansen") blijft juist klein.

## Nieuwe regels (overal hetzelfde: invoer, synchronisatie met GoHighLevel, imports)
1. **Wat je typt blijft staan.** Hoofdletters midden in een woord worden nooit aangepast (McDonald, BV, KPN, DeWitt).
2. **Altijd beginnen met een hoofdletter.** De eerste letter van een voornaam, achternaam en bedrijfsnaam wordt een hoofdletter als die klein getypt is.
3. **Namen met een hoofdletter.** In voor- en achternaam krijgt elk naamdeel een hoofdletter (jan-willem → Jan-Willem, jansen → Jansen). Dubbele namen met streepje: beide delen.
4. **Tussenvoegsels klein — alleen midden in een persoonsnaam.** van, de, der, den, ten, ter, te, 't, op, in, het, van 't, ... worden klein in het veld tussenvoegsel en midden in een achternaam ("Berg van der" blijft niet staan, "Van Der Berg" → "van der Berg"). Een tussenvoegsel als eerste woord van een veld krijgt wél een hoofdletter (regel 2).
5. **IJ is één letter.** Begint een naamdeel met ij, dan worden beide hoofdletters: ijsbrand → IJsbrand, van der ijssel → van der IJssel, Ijzerman → IJzerman.
6. **Bedrijfsnamen:** alleen regel 1, 2 en 5 voor de eerste letter. Geen tussenvoegselregels, dus "Hotel De Kroon" blijft "Hotel De Kroon".
7. E-mail, adres en andere velden worden niet aangeraakt.

## Bestaande gegevens
- Eenmalige correctie op contactpersonen en de contactnaam op aanvragen/reserveringen: eerste letter hoofdletter, "Ij" → "IJ", tussenvoegsels midden in naam klein.
- Bedrijfsnamen die eerder onterecht zijn verkleind (bijv. "Hotel de Kroon") zijn niet betrouwbaar terug te zetten; die herstellen we vanuit GoHighLevel bij de volgende volledige synchronisatie, alleen waar de spelling alleen in hoofdletters verschilt.

## Controle
- Kleine tests per regel met voorbeelden uit dit verzoek (jansen, van der Berg, IJsbrand, van der IJssel, Jan-Willem, McDonald, Hotel De Kroon).
- In de preview een contactpersoon en bedrijf aanmaken en bewerken, en controleren dat het na een synchronisatieronde nog zo staat. Niets publiceren.

## Technisch
- `src/lib/utils.ts`: `capitalizeWords` vervangen door `normalizePersonName(str, { part: 'first'|'last'|'infix' })` en `normalizeCompanyName(str)`; toepassen in ContactsContext, CompaniesContext, NewInquiryDialog, NewReservationDialog, contact-/bedrijfsformulieren.
- Database: `normalize_dutch_name_particles` opsplitsen in `normalize_person_name(text, is_infix bool)` en `normalize_company_name(text)`; `normalize_name_particles_trigger` gebruikt persoonsregels voor first_name/last_name/infix/contact_name en bedrijfsregel voor companies.name, contacts.company, company_name. Kortere tussenvoegsellijst (zonder en/in-als-woord-in-bedrijf, la/le/al/el/y alleen in achternaam-midden).
- Edge: dezelfde helper in `supabase/functions/_shared/ghlCommon.ts` voor namen uit GoHighLevel, met Deno-unit test; ghl-auto-sync, ghl-webhook, ghl-sync opnieuw deployen.
- Vitest-test voor de frontend-helper; eenmalige migratie voor bestaande persoonsnamen.
