# Oude versie behouden en CRM 2.0 veilig laten testen

## Doel

De huidige 2.0-versie mag niet worden gepubliceerd voordat de klant akkoord geeft. De oude versie blijft op het bestaande live adres staan. CRM 2.0 komt in een aparte testversie met echte gegevens.

## Bevestigde situatie

- De oude live versie wordt niet overschreven zolang er niet op **Publish** wordt geklikt.
- Er bestaat nu nog geen aparte testversie; de 2.0-wijzigingen staan in het hoofdproject als niet-gepubliceerde wijzigingen.
- De foutmelding uit de screenshot ontstaat bij het ophalen van de ingelogde sessie: de browservergrendeling `lock:...-auth-token` loopt na 10 seconden vast. Daardoor mislukt daarna het laden van de contacten; de contacten zelf zijn niet de oorzaak.
- De app heeft een eigen inlogscherm. Een openbare previewlink omzeilt alleen de Lovable-toegang, niet de inlog van CliqCRM. De klant gebruikt daarom het reeds aangemaakte klantaccount.

## Veilige volgorde

### 1. CRM 2.0 apart bewaren
- Maak vanuit de huidige toestand een aparte draft **CRM 2.0 klanttest**.
- Alle 2.0-wijzigingen blijven daarin beschikbaar en kunnen daar verder worden hersteld en getest.

### 2. Hoofdproject terug naar de oude versie
- Zet het hoofdproject via de versiegeschiedenis terug naar het laatste punt vóór CRM 2.0.
- Publiceer hierbij niets: het bestaande live adres blijft ondertussen de oude versie tonen.
- Controleer dat de oude navigatie en schermindeling terug zijn in het hoofdproject.

### 3. Inlogblokkade in CRM 2.0 oplossen
- Voorkom dat meerdere gelijktijdige sessie-aanvragen elkaar in de preview blokkeren.
- Laat de app de sessie één keer initialiseren en daarna alleen op echte inlogwijzigingen reageren.
- Behandel een tijdelijke sessievergrendeling als herstelbare fout: geen misleidende rode melding “Fout bij laden contacten”, maar opnieuw proberen zonder de pagina vast te zetten.
- Behoud veilig sessiebeheer op het gepubliceerde domein; de aanpassing wordt beperkt tot de preview-problematiek.

### 4. CRM 2.0 volledig controleren
- Inloggen met het klantaccount in de aparte testversie.
- Dashboard, contacten, bedrijven, aanvragen, taken, kalender en instellingen openen.
- Controleren dat de lockmelding niet terugkomt bij herladen, meerdere tabbladen en opnieuw inloggen.
- Controleren dat bestaande echte gegevens zichtbaar blijven en wijzigingen correct worden opgeslagen.

### 5. Preview aan klant geven
- Vanuit **CRM 2.0 klanttest** een deelbare previewlink maken.
- Klant logt in met het bestaande klantaccount en werkt met echte gegevens.
- Niets publiceren totdat de klant expliciet akkoord geeft.

### 6. Pas na klantakkoord
- De goedgekeurde draft samenvoegen met het hoofdproject.
- Daarna pas **Publish/Update** gebruiken om CRM 2.0 de oude live versie te laten vervangen.

## Belangrijk

- Tijdens het testen gebruikt de klant dezelfde echte gegevens en lopen de GoHighLevel-koppelingen door.
- Terugzetten van het hoofdproject gebeurt via de ingebouwde versiegeschiedenis, niet door 2.0-code handmatig te verwijderen; zo blijft de volledige 2.0-versie veilig in de draft bewaard.
- Er wordt in deze aanpak niets gepubliceerd vóór klantgoedkeuring.
