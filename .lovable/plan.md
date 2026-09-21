# Klant eerst laten meekijken, zonder de live versie te raken

Je hoeft hiervoor niets aan de app te veranderen. De klant kijkt mee via een deelbare previewlink; het adres dat nu live staat (planningtoolcrm.lovable.app) blijft precies zoals het is totdat jij zelf op Publish klikt.

## Wat jij doet

1. Klik rechtsboven op **Share** en kies **Share preview**.
2. Kopieer de link en stuur die naar de klant. De link werkt 7 dagen en de klant heeft geen account nodig.
3. Loopt de termijn af, maak dan simpelweg een nieuwe link aan.
4. Zodra de klant akkoord is, klik je op **Publish** om de nieuwe versie live te zetten.

## Belangrijk om te weten

- De klant werkt in dezelfde database als de live versie. Alles wat hij aanpast (aanvragen, taken, contactpersonen) is dus echt. Dat is de keuze die je hebt gemaakt.
- De koppeling met GoHighLevel loopt ook door tijdens het testen: nieuwe aanvragen komen binnen en wijzigingen gaan terug.
- Nieuwe wijzigingen die ik daarna maak, zie de klant automatisch in dezelfde previewlink.

## Één ding dat ik wil voorstellen

Een korte melding bovenaan het scherm die alleen in de preview zichtbaar is: "Testversie — je werkt met echte gegevens". Zo weet de klant dat aanpassingen echt doorgevoerd worden. Op de gepubliceerde versie is die melding niet te zien.

Zeg je nee, dan is er niets te bouwen en kun je direct de deelbare link versturen.

## Technische uitwerking (alleen bij het bovenstaande voorstel)

- Nieuw `src/components/PreviewBanner.tsx`: rendert alleen wanneer `window.location.hostname` het previewdomein bevat (`-preview--` / `lovableproject.com`), gebruikt bestaande semantische tokens, dismissible via `sessionStorage`.
- Gerenderd in `AppLayout.tsx` boven de bestaande header; geen route- of datalogica geraakt.
