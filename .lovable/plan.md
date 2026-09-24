# Preview sneller laden (CRM 2.0 klanttest)

Doel: de previewlink toont binnen enkele seconden het eerste scherm, zonder dat de live versie verandert.

## Wat er nu gebeurt
- Bij openen worden bijna alle schermen tegelijk ingeladen (alleen Kalender, Instellingen en de publieke offertepagina laden pas bij gebruik).
- Na inloggen halen vijf gegevensbronnen tegelijk alle contacten, bedrijven, aanvragen, reserveringen en taken op, voordat het dashboard echt bruikbaar is.
- Tijdens inloggen staat er alleen de tekst "Laden...".

## Aanpak
1. **Meten eerst**: preview openen, laadtijd en de trage verzoeken vastleggen, zodat de winst aantoonbaar is.
2. **Schermen op aanvraag laden**: alle pagina's behalve het dashboard pas inladen wanneer je ernaartoe gaat.
3. **Gegevens gefaseerd ophalen**: het dashboard eerst met alleen wat het nodig heeft (open taken, recente aanvragen, komende reserveringen). De volledige lijsten laden daarna op de achtergrond of pas wanneer een pagina ze nodig heeft.
4. **Direct beeld**: in plaats van "Laden..." meteen de menubalk en grijze plaatshouders tonen.
5. **Opnieuw meten** en vergelijken; controleren dat alle pagina's nog goed werken.

De live versie wordt niet gepubliceerd.

## Technische details
- `App.tsx`: overige pagina's via `React.lazy`; `QueryClient` met `staleTime` zodat terugnavigeren niet opnieuw ophaalt.
- Contexts (Contacts/Companies/Inquiries/Bookings/Tasks): fetch uitstellen tot eerste gebruik (lazy `ensureLoaded`) of na eerste paint via `requestIdleCallback`; dashboard krijgt eigen gerichte queries met `limit` en expliciete kolommen.
- Loader in `ProtectedRoutes` vervangen door layout-skeleton.
- Verificatie met Playwright: tijd tot eerste scherm en aantal/omvang netwerkverzoeken voor en na.
