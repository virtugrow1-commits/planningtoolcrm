# Klanttype wijzigen bij het bewerken van een contactpersoon

## Wat je gaat zien
Bij **Bewerken** op de contactpersoonkaart komt bovenaan het blok "Bedrijven" een keuze **Klanttype: Particulier / Bedrijf**.

1. **Particulier → Bedrijf** (contact hoort eigenlijk bij een bedrijf)
   - Kies "Bedrijf" en zoek het bedrijf op (of maak een nieuw bedrijf aan).
   - Het contact wordt aan dat bedrijf gekoppeld en losgekoppeld van zijn particuliere klantkaart.
   - Aanvragen, reserveringen, taken en gespreksverslagen van die particuliere kaart verhuizen mee naar het gekozen bedrijf.
   - Blijft de particuliere kaart daarna leeg achter, dan wordt die opgeruimd.
2. **Bedrijf → Particulier** (contact is eigenlijk een privépersoon)
   - Kies "Particulier". Er wordt een particuliere klantkaart op naam van het contact gemaakt (of een bestaande hergebruikt) en het contact wordt daaraan gekoppeld.
   - De koppeling met het bedrijf wordt verwijderd; historie bij het bedrijf blijft daar staan (zoals bij "uit dienst").
3. Voor het opslaan verschijnt een korte bevestiging: "Klanttype wijzigen naar … ? X aanvragen en Y reserveringen gaan mee."
4. Het contact verschijnt direct in het juiste tabblad (Particulieren of Contactpersonen/Bedrijven).

Daarnaast op de **klantkaart zelf** (bedrijf/particulier): de bestaande schakelaar "Particulier" blijft werken voor als de hele kaart verkeerd staat.

## Technisch
- `ContactDetailPage.tsx` `CompanyField`: toggle Klanttype in edit-modus; bij Bedrijf bestaande bedrijfszoeker (alleen `!isPrivate`), bij Particulier geen zoeker.
- Omzetten via `linkContact`/`unlinkContact` + update `contacts.company_id`; bij Particulier→Bedrijf `company_id` van inquiries/bookings/tasks/contact_activities/documents van de oude particuliere kaart (voor dit contact) naar nieuw bedrijf; lege particuliere company verwijderen.
- Bij Bedrijf→Particulier: `addCompany({ name: volledige naam, isPrivate: true })` in CompaniesContext, dan koppelen.
- Geen databasewijziging nodig; GHL-sync loopt via bestaande triggers.
