# Previewfout oplossen vóór klanttest

## Doel
De CRM 2.0-preview moet betrouwbaar openen zonder de LockManager-melding. De oude live versie blijft ongewijzigd en CRM 2.0 wordt niet gepubliceerd.

## Vastgesteld
- De fout ontstaat in het beheer van de ingelogde sessie, vóórdat contacten worden opgehaald.
- De preview gebruikt gedeelde sessieopslag en wacht daarbij op een exclusieve browservergrendeling die na 10 seconden verloopt.
- Bij het openen worden nu zowel een sessieluisteraar als een losse sessiecontrole gestart; daardoor kan dezelfde initialisatie gelijktijdig plaatsvinden.
- De live versie blijft staan zolang CRM 2.0 niet wordt gepubliceerd.

## Aanpak
1. Maak de sessie-initialisatie enkelvoudig: één eerste sessiecontrole, daarna alleen reageren op echte inlogwijzigingen.
2. Voorkom dubbele rol- en gegevensaanvragen tijdens het openen van de app.
3. Voeg een gerichte, korte herstelpoging toe wanneer alleen de tijdelijke previewvergrendeling verloopt; andere fouten blijven zichtbaar.
4. Houd de aanpassing beperkt tot handgeschreven inloglogica en foutafhandeling; automatisch beheerde verbindingsbestanden blijven onaangetast.
5. Test de CRM 2.0-preview met herladen, uit- en inloggen en twee geopende tabbladen.
6. Controleer daarna contacten, bedrijven, aanvragen, taken, kalender en instellingen op correct laden.
7. Deel pas na deze controle de klanttestlink. Publiceer niets en wijzig het bestaande live adres niet.

## Resultaat
De klant kan CRM 2.0 via de aparte preview beoordelen, terwijl de oude live versie actief blijft tot expliciete goedkeuring.
