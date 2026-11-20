# Gespreksverslag met meerdere contactpersonen + tussenvoegsel-bug

## 1. Bug: tussenvoegsel ontbreekt in de naam
Bij "Sabine en Jac **van** Dooren" valt "van" weg in de titel, het kruimelpad en een paar andere plekken op de contactpagina.
- Eén gedeelde naamfunctie (voornaam + tussenvoegsel + achternaam, lege waarden en "—" overslaan).
- Gebruiken op de contactpagina: titel, kruimelpad, verwijder-melding, kaartje met naam, naam bij nieuwe aanvraag en de zoekvergelijking.
- Snel nalopen of contactlijsten, familie-/bedrijfspagina en aanvraagkoppelingen dezelfde fout hebben en die meteen meenemen.

## 2. Gesprek met meerdere contactpersonen
Bij het vastleggen van een gespreksverslag/notitie kun je aangeven met wie er gesproken is: één of meerdere personen van hetzelfde bedrijf of dezelfde familie.

Zo werkt het:
- In het venster "Gespreksverslag" verschijnt "Gesproken met": aanvinklijst van alle personen van dat bedrijf/die familie. De persoon van wie je de pagina opent staat al aangevinkt.
- Het verslag wordt één keer opgeslagen (geen dubbele notities) en verschijnt bij elke aangevinkte persoon in de tijdlijn, en één keer op de bedrijfs-/familiepagina.
- In de tijdlijn staat bij het verslag: "Gesproken met: Sabine van Dooren, Jac van Dooren".
- Naar CliqCRM gaat de notitie zoals nu naar de hoofdpersoon; de namen van de andere deelnemers worden bovenaan in de notitietekst gezet zodat ze daar ook zichtbaar zijn.

## Technisch
- Nieuwe koppeltabel `contact_activity_participants` (activity_id, contact_id, user_id) met GRANTs + RLS zoals contact_activities. Bestaande verslagen: hoofdcontact als enige deelnemer (backfill).
- CallLogPanel: deelnemerskeuze, insert van deelnemers na de activiteit; ophalen per contact via deelnemers OR contact_id; per bedrijf blijft op company_id (dedupe op id).
- useContactActivities/ContactDetailPage: toon deelnemersregel.
- Push naar GHL: deelnemersregel aan body toevoegen in de bestaande push-functie (redeploy van die functie).
- Naamhelper in src/lib, kleine test voor "Sabine en Jac" + "van" + "Dooren" → "Sabine en Jac van Dooren".
- Niet publiceren.
