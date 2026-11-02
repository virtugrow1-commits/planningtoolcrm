# Klant en bedrijf automatisch invullen bij "Maak optie"

## Wat er nu gebeurt
Het venster "Nieuwe optie" vult klant en bedrijf alleen in als de aanvraag al echt aan een contactpersoon en bedrijf gekoppeld is. Bij aanvraag #001932 (Jan Klaasen Test, binnengekomen via een formulier) staat alleen de naam als tekst. Er is geen koppeling, dus blijven beide velden leeg.

## Wat ik ga aanpassen
1. **Klant zoeken op naam.** Is er geen gekoppelde contactpersoon, dan zoekt het venster in de contactpersonen naar dezelfde naam (hoofdletters en tussenvoegsels maken niet uit) en selecteert die meteen. Hetzelfde geldt voor het e-mailadres als dat bekend is.
2. **Bedrijf afleiden.** Is er geen gekoppeld bedrijf, dan neemt het venster het bedrijf van de gevonden contactpersoon. Lukt dat niet, dan zoekt het op de bedrijfsnaam uit de aanvraag.
3. **Geen match gevonden.** Dan opent "Nieuwe contactpersoon toevoegen" vanzelf, met de voornaam, achternaam, het e-mailadres en het telefoonnummer uit de aanvraag al ingevuld. Bij een bekende bedrijfsnaam geldt hetzelfde voor "Nieuw bedrijf toevoegen". Je hoeft alleen nog op opslaan te drukken.
4. **Koppeling bewaren.** Na het aanmaken van de optie wordt de aanvraag ook aan die contactpersoon en dat bedrijf gekoppeld. De volgende keer staat alles dan meteen goed.

## Technisch
- `InquiryDetailPage`: geef in `prefill` ook e-mail, telefoon en bedrijfsnaam mee. Zet na een gelukte `addBooking` `contactId` en `companyId` op de aanvraag via `updateInquiry`.
- `NewReservationDialog`: koppel bij openen op naam of e-mail aan een bestaande contactpersoon (genormaliseerde vergelijking). Geen match: vul `contactForm` en `companyForm` vooraf in en zet ze open.
- Dezelfde aanpak werkt ook voor "Maak reservering", dat hetzelfde venster gebruikt.
