# Contactpersoon van een aanvraag ook altijd bij het bedrijf tonen

## Wat er misgaat
Aanvraag #001968 (Sem Bakker, Verbeta) is aan het bedrijf Verbeta gekoppeld, maar Sem Bakker zelf heeft geen koppeling met Verbeta. De bedrijfspagina toont alleen personen die echt aan het bedrijf gekoppeld zijn, dus hij ontbreekt daar.

Dit gebeurt op meerdere plekken waar een aanvraag achteraf een bedrijf krijgt (aanvulling uit CliqCRM, automatische sync, webhook, handmatig bewerken): alleen de aanvraag krijgt het bedrijf, de persoon niet. Er zijn nu 25 aanvragen waarbij persoon en bedrijf zo los van elkaar staan.

## Oplossing
1. **Eén vaste regel in de database:** zodra een aanvraag of reservering zowel een contactpersoon als een bedrijf heeft, wordt die persoon automatisch aan dat bedrijf gekoppeld. Dat werkt dus voor elke manier waarop een aanvraag binnenkomt of wordt aangepast.
   - Heeft de persoon nog geen hoofdbedrijf, dan wordt dit zijn hoofdbedrijf.
   - Heeft hij al een ander bedrijf, dan komt dit erbij als extra bedrijf (hoofdbedrijf blijft staan).
   - Is hij bij dit bedrijf "uit dienst" gemeld, dan blijft dat zo (geen ongewenst terugzetten).
2. **Bestaande gevallen rechtzetten:** de 25 bestaande aanvragen (en reserveringen met hetzelfde probleem) krijgen eenmalig de ontbrekende koppeling, inclusief Sem Bakker bij Verbeta.
3. Controle achteraf: Verbeta toont Sem Bakker; telling van losse gevallen is 0.

## Technisch
- Migratie: functie `ensure_contact_company_from_record()` (AFTER INSERT/UPDATE OF contact_id, company_id op `inquiries` en `bookings`): `INSERT INTO contact_companies ... ON CONFLICT (contact_id, company_id) DO NOTHING`; `is_primary` = contact heeft geen `company_id`; in dat geval ook `contacts.company_id`/`company` zetten (bestaande trigger `sync_contact_company_link` houdt de rest bij). Niet voor familie-/particulier-logica aanpassen; `departed_at` wordt nooit overschreven.
- Backfill via data-update voor alle bestaande paren zonder koppeling.
- Geen wijzigingen aan schermen of edge functions nodig; niets publiceren.
