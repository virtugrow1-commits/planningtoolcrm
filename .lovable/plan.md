# Boomstructuur CRM afmaken en bugs oplossen

Ik heb de lijst nagelopen tegen de echte gegevens. De klantenkaart staat er, maar op vier punten klopt de structuur nog niet.

## Wat er nu misgaat

- **Particulieren hebben geen klantenkaart.** 342 contactpersonen hangen aan geen enkel bedrijf, en er is nog geen enkele kaart als "particulier" gemarkeerd. Daardoor hebben 129 aanvragen geen bedrijf.
- **Uit dienst werkt niet in de praktijk.** 18 mensen staan als uit dienst, maar bij geen van hen is vastgelegd wanneer. Daardoor blijft hun oude historie ongescheiden.
- **Gespreksverslagen van uit-dienst-mensen** verschijnen bij elke werkgever, ook bij de nieuwe.
- **288 bevestigde reserveringen** hangen niet aan een aanvraag; 75 daarvan zijn zeker toewijsbaar.

## Wat ik ga doen

### 1. Particulieren krijgen een eigen klantenkaart
- Voor alle 342 particulieren maak ik in één keer een klantenkaart aan op hun eigen naam, gemarkeerd als particulier, met de persoon eraan gekoppeld.
- Hun bestaande aanvragen, opties en taken komen daarmee automatisch op die kaart te staan.
- Bij nieuwe bedrijven komt een vinkje "Particulier" in het aanmaakvenster, zodat dit voortaan meteen goed staat.
- Op een particuliere kaart heet het datumveld **Verjaardag** (met naam erbij) in plaats van Geboortedatum, met een melding als die binnen 14 dagen valt.

### 2. Uit dienst netjes afhandelen
- Voor de 18 mensen die al uit dienst zijn leg ik de datum van uitdienstmelding alsnog vast, zodat de scheiding meteen werkt.
- Bij een nieuwe uitdienstmelding wordt de oude werkgever losgekoppeld als hoofdbedrijf; de historie blijft bij die oude werkgever staan onder "uit dienst".

### 3. Gespreksverslagen bij de juiste werkgever
- Op de klantenkaart worden alleen verslagen getoond uit de periode dat iemand daar werkte. Bij de nieuwe werkgever zie je alleen de nieuwe gesprekken.

### 4. Koppelingen aanvullen en ontbrekende koppelingen zichtbaar maken
- De 75 zeker toewijsbare reserveringen koppel ik aan hun aanvraag.
- Waar een koppeling echt ontbreekt (reservering zonder aanvraag, taak zonder aanvraag of contactpersoon) komt een duidelijke, klikbare melding op de kaart in plaats van stille leegte.
- Aanvragen krijgen automatisch het bedrijf van hun contactpersoon zodra dat bekend is.

## Technische details

- Data: eenmalige `run_sql`-acties — particuliere `companies`-rijen (`is_private = true`) plus `contact_companies`-koppeling en `contacts.company_id` voor contacten zonder bedrijf; `contact_companies.departed_at` vullen voor `contacts.departed = true`; `bookings.inquiry_id` zetten waar de contactpersoon precies één aanvraag heeft; `inquiries.company_id` afleiden uit `contacts.company_id`.
- `CompanyDetailPage.tsx`: verslagen filteren op `departedAtByContact`, label Verjaardag bij `isPrivate`, waarschuwingsregels bij reserveringen/taken zonder koppeling.
- `CallLogPanel.tsx`: optionele grens per contact (`visibleUntil`) zodat oude verslagen buiten beeld blijven bij de nieuwe werkgever.
- `CompaniesPage.tsx`: `isPrivate` in het nieuw-bedrijf-formulier; `CompaniesContext.addCompany` ondersteunt dit al.
- `ContactDetailPage.tsx`: bij uitdienstmelding naast `markDeparted` ook het hoofdbedrijf loskoppelen; veldlabel volgt de particuliere status.
- Geen schemawijziging nodig; GHL-sync, reserveringslogica en huisstijl blijven ongewijzigd. Afsluiten met `bunx tsgo --noEmit` en een browsercontrole van een particuliere kaart, een bedrijfskaart en een uit-dienst-contact.
