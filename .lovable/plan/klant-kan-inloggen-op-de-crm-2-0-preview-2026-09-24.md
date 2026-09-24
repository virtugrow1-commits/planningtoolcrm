# Klant kan inloggen op de CRM 2.0-preview

## Vastgesteld
- Het account sjors@ontmoetenaandedonge.nl bestaat, is bevestigd en werkt met e-mail en wachtwoord. Iris heeft ook een account.
- De preview en de live versie gebruiken dezelfde accounts. Er ontbreekt dus geen account.
- Vandaag zijn drie inlogpogingen geweigerd met "onjuiste inloggegevens". Daarna gaf een poging tot registreren "gebruiker bestaat al". Het ingevoerde wachtwoord klopt dus niet. Er is geen storing in de preview.
- De inlogpagina heeft geen knop "Wachtwoord vergeten". Na registreren meldt de pagina ten onrechte "Je bent nu ingelogd".

## Aanpak
1. Voeg "Wachtwoord vergeten?" toe aan de inlogpagina. De klant vult zijn e-mailadres in en krijgt een resetlink.
2. Maak een pagina om een nieuw wachtwoord in te stellen. De resetlink opent deze pagina, en na opslaan is de klant ingelogd.
3. Toon duidelijke Nederlandse foutmeldingen:
   - "E-mail of wachtwoord onjuist. Gebruik 'Wachtwoord vergeten?'"
   - "Dit e-mailadres heeft al een account. Log in of herstel je wachtwoord."
4. Vervang de onjuiste melding na registreren door "Controleer je e-mail om je account te bevestigen".
5. Test het resetten van begin tot eind in de preview.

Er wordt niets gepubliceerd. De live versie blijft ongewijzigd. Let op: een nieuw wachtwoord geldt ook voor de live versie, omdat het hetzelfde account is.

## Technische details
- `AuthPage.tsx`: modus "forgot", die `resetPasswordForEmail(email, { redirectTo: origin + '/reset-password' })` aanroept. Foutcodes `invalid_credentials` en `user_already_exists` worden vertaald.
- Nieuwe openbare route `/reset-password` in `App.tsx`, buiten `ProtectedRoutes`. Die pagina controleert `type=recovery` en roept `updateUser({ password })` aan.
