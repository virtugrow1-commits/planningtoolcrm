# Hoofdproject terugzetten naar de versie van vóór CRM 2.0

## Doel
De preview van het hoofdproject toont weer de oude (huidige live) versie, terwijl de CRM 2.0-werkversie veilig blijft bewaard in de draft "CRM 2.0 klanttest" (drft_01m39km6gkfhx8qwf7794mm5b4). Er wordt niets gepubliceerd; de live site blijft ongewijzigd.

## Waarom terugzetten (en moet het per se?)
- Het is een **vangnet, geen vereiste**. Zolang je niet op Publish/Update klikt, blijft de live site sowieso de oude versie.
- Reden 1 — bescherming tegen een mis-klik: staat het hoofdproject nog op 2.0 en klik je per ongeluk op Publish, dan gaat de onafgeronde 2.0 live. Staat hij teruggezet op de oude versie, dan publiceer je bij een mis-klik gewoon de oude versie.
- Reden 2 — duidelijkheid: hoofdproject = wat live staat (de oude versie), draft "CRM 2.0 klanttest" = de nieuwe versie die de klant test. Zo weet je altijd precies wat waar staat.
- Alternatief: niets terugzetten en gewoon niets publiceren. Werkt ook, maar dan is de 2.0-code de "stand" van het hoofdproject en is één mis-klik op Publish genoeg om 2.0 live te zetten.

## Stappen (in de Lovable-interface, door jou uit te voeren)
1. Open het project en zorg dat je in het **hoofdproject** werkt, niet in de draft. De draft staat in het projectoverzicht onder "CRM 2.0 klanttest".
2. Klik in de editor op het **klok-icoon (geschiedenis / version history)**.
3. Blader naar de laatste versie **vóór** de CRM 2.0-aanpassingen begonnen (rond de dag dat de opdrachtomschrijving "CRM Aan de Donge uitbreiden" is geüpload — daarvoor begonnen de klantkaart-tabs en de nieuwe klantformulieren).
4. Selecteer die versie en kies **Herstellen / Restore**. Bevestig de melding.
5. Klik daarna **niet** op Publish/Update. De live site op planningtoolcrm.lovable.app blijft sowieso de oude versie tot je zelf publiceert.

## Wat er wel en niet teruggedraait
- **Terug:** alleen de code van het hoofdproject. De preview laat na herladen weer de oude versie zien.
- **Blijft staan:** de database. De migraties van 29-09 (nieuwe kolommen, tabellen, takenregels) blijven aanwezig — de oude code gebruikt die velden niet, dus er breekt niets.
- **Blijft werken:** inlogaccounts, instellingen en de GoHighLevel-koppeling.

## Aandachtspunten
- De draft "CRM 2.0 klanttest" is ongeveer 5 dagen geleden aangemaakt en loopt iets achter op het hoofdproject: de laatste werkzaamheden (taakautomatisering-panel, laatste afrondingen) zitten niet in de draft maar wel in de versiegeschiedenis van het hoofdproject. Later de 2.0 terugkrijgen kan door in dezelfde geschiedenis naar een recente versie te herstellen (niets gaat verloren).
- De previewlink voor de klant pas sturen als de klantversie staat zoals jij die wilt laten zien, en publiceren pas na akkoord van de klant.

## Wat ik hierna kan doen (na akkoord)
- Niks in de code wijzigen — dit is een handmatige stap in de interface.
- Eventueel: de draft verversen zodat deze ook de laatste aanpassingen bevat, en daarna de preview van de draft controleren (inlogfout, snelheid) voordat je de link naar de klant stuurt.
