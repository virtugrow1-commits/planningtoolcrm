# Uit dienst per bedrijf in plaats van per persoon

## Wat er nu misgaat
- "Uit dienst" is één vinkje op de persoon zelf. Zet je het aan, dan geldt het voor alle bedrijven tegelijk.
- Bij het opslaan markeert het systeem ook elke koppeling als uit dienst. De nieuwe koppeling met Mijzo dus ook.
- Huidige stand bij Lavinia Manca: de persoon staat op uit dienst. Haar koppeling met Stichting Mijzo staat ook op uit dienst. Als hoofdbedrijf staat nog Amphia Ziekenhuis, maar daar is geen koppeling meer mee.

## Wat we gaan bouwen
1. **Uit dienst per bedrijf.** Op de contactpagina krijgt elk gekoppeld bedrijf een eigen knop: "Uit dienst melden" of "Weer in dienst". Bij Amphia meld je haar dan uit dienst, terwijl ze bij Mijzo in dienst blijft.
2. **Wisselen van werkgever in één stap.** Met de knop "Naar ander bedrijf" kies je het nieuwe bedrijf. Het oude bedrijf gaat op uit dienst (met de datum), het nieuwe wordt het hoofdbedrijf. De geschiedenis blijft bij het oude bedrijf staan.
3. **Het algemene vinkje volgt de bedrijven.** "Uit dienst" bij de persoon gaat alleen aan als ze bij geen enkel bedrijf meer in dienst is. Lijsten en keuzevensters (aanvragen, taken, offertes) laten haar dan weer gewoon zien bij Mijzo.
4. **Bedrijfspagina.** Bij Amphia staat ze onder "uit dienst". Bij Mijzo staat ze bij de actieve contactpersonen.
5. **Lavinia rechtzetten.** De koppeling met Amphia komt terug, op uit dienst per vanochtend. Mijzo wordt actief en haar hoofdbedrijf. Het vinkje bij de persoon gaat uit.

## Technische details
- `markDeparted(contactId, companyId?)` werkt alleen op het gekozen bedrijf. Er komt `markRejoined(contactId, companyId)` bij (zet `departed_at` op null).
- `contacts.departed` wordt afgeleid: true alleen als elke `contact_companies`-rij een `departed_at` heeft. Bij het wisselen van werkgever worden `contacts.company_id` en `company` bijgewerkt naar het nieuwe bedrijf, zodat CliqCRM het juiste bedrijf krijgt.
- De automatische "markeer alle koppelingen"-stap in `ContactDetailPage` handleSave verdwijnt. Het algemene vinkje wordt alleen-lezen en volgt de stand per bedrijf.
- Lavinia herstellen met een eenmalige data-update, geen migratie.
- Test: uit dienst bij bedrijf A laat de koppeling met bedrijf B actief.
