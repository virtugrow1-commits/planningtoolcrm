# CRM Aan de Donge afmaken

Dit is wat er nog moet gebeuren om de opdracht compleet te maken. Alles gebeurt in de testversie en er wordt niets gepubliceerd.

## Nog te bouwen
1. **Klantkaart met tabs**: Overzicht, Contactpersonen, Taken, Aanvragen, Toekomstige reserveringen en Afgeronde reserveringen. Nu staan deze onderdelen nog als blokken onder elkaar.
2. **Aanvraagpagina met tabs**: Overzicht, Contactpersonen, Taken, Notities, Reservering en Geschiedenis. Bovenaan komen bedrijf, nummer, titel, status, eventdatum en aantal personen.
3. **Nieuwe velden invulbaar maken** op de aanvraag: titel, datum laatste contact en datum volgende actie.
4. **Contactpersoon**: vakjes voor tussenvoegsel, mobiel en hoofdcontactpersoon ja/nee. Controle dat een geboortedatum niet in de toekomst ligt.
5. **Nieuwe aanvraag**: een knop "Nieuwe klant aanmaken" die dezelfde keuze Bedrijf/Particulier opent. Daarna wordt de nieuwe klant direct ingevuld.
6. **Pipeline**: de kolommen groeperen in Aanvraag, Sales, Reservering en Aftersales. De kaart laat ook de primaire contactpersoon zien.
7. **Zoeken**: dezelfde zoekfunctie, die geen verschil maakt tussen hoofdletters en letters met accenten, ook gebruiken op de lijsten van klanten en contactpersonen.

## Kleine controles
- Het filter "Aanvraag" op de takenpagina even hoog maken als de andere filters.
- Het zoeken op de aanvragenpagina opschonen, zodat de oude en de nieuwe manier van zoeken elkaar niet in de weg zitten.
- Nergens "undefined" of "null" tonen. Voor verwijderen moet je altijd eerst bevestigen.

## Testen
- De 7 testscenario's uit de opdracht doorlopen, op desktop en op mobiel. Daarvoor maak ik Testbedrijf BV aan met Jan Jansen en Piet de Vries, twee aanvragen, taken en een reservering in de toekomst en in het verleden.
- Controleren dat de koppeling met GHL en de knop "Offerte klaarzetten" nog werken.
- Daarna alle testgegevens weer verwijderen.

## Blijft bij jou
- Het hoofdproject terugzetten naar de versie van vóór CRM 2.0.
- De previewlink naar de klant sturen.
- De workflows in GoHighLevel uitzetten die zelf taken aanmaken.
- Publiceren pas na akkoord van de klant.

## Buiten deze opdracht
- Rechten per rol.
- Pipelinefases instellen via Instellingen.

## Technisch
- `CompanyDetailPage` en `InquiryDetailPage` krijgen shadcn `Tabs`. De bestaande secties worden verplaatst, niet herschreven.
- `InquiryDetailsTab` en `ContactDetailPage` krijgen formuliervelden voor `title`, `last_contact_at`, `next_action_at`, `infix`, `mobile` en `is_primary`.
- De dialoog Nieuwe klant uit `CompaniesPage` wordt een los component. `NewInquiryDialog` hergebruikt dat component.
- Geen databasewijzigingen nodig. De kolommen bestaan al.
