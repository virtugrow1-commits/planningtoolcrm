# Alles nalopen en afronden (zonder te publiceren)

## Wat ik oppak
1. **Beveiliging** – de 8 openstaande beveiligingswaarschuwingen bekijken en oplossen waar dat veilig kan (zonder bestaande werking te breken).
2. **Automatische taken testen** – een testaanvraag en testreservering aanmaken, controleren dat de ingestelde taken verschijnen met juiste datum en verantwoordelijke, en de testgegevens daarna weer verwijderen.
3. **Feedbackknop "wacht op jou"** – de plek zoeken waar deze melding staat en een knop toevoegen om te kunnen reageren.
4. **Volledige doorloop met de browser** – inloggen, Dashboard, CRM (bedrijven, contactpersonen, klantenkaart), Aanvragen (incl. "Offerte klaarzetten"), Kalender, Taken en Instellingen openen; fouten die ik tegenkom meteen oplossen.
5. **Snelheid dashboard** – het dashboard haalt nu alles in één keer op; alleen de benodigde gegevens (bijv. openstaande taken, komende reserveringen) laden zodat het sneller opent.

## Wat ik niet doe
- Niets publiceren; de live versie blijft de oude tot de klant akkoord geeft.
- Versiegeschiedenis terugzetten en de previewlink versturen doe jij zelf (dit kan ik niet voor je doen).
- GHL-workflows uitzetten moet in GoHighLevel zelf.

## Technisch
- Security: `security--get_scan_results`, fixes via migraties (search_path, grants, RLS).
- Test via Playwright met `lovable auth-session --self`; testrecords met herkenbare titel, na afloop verwijderd.
- Dashboard: queries beperken tot relevante kolommen/periodes in plaats van volledige tabellen.
