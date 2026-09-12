# Taken-pagina sneller maken (en laatste 2.0-punten nalopen)

## Wat er nu gebeurt

De pagina Taken voelt traag door drie dingen die ik heb nagekeken:

1. **Alles wordt in één keer op het scherm gezet.** Er staan 859 openstaande taken in de database. De lijst tekent ze allemaal, en per regel zit ook nog een statuskeuzelijst en een verwijderknop. Dat zijn duizenden losse onderdelen bij het openen van de pagina.
2. **De database heeft geen zoekhulp op taken.** Op de tabel taken staat alleen een sleutel op het eigen nummer — geen index op status, datum, toegewezen persoon of koppelingen. Elke keer dat taken opgehaald worden, wordt de hele tabel (3.762 rijen) doorlopen.
3. **Zodra je één letter in het zoekveld typt, wordt direct het hele archief geladen** (2.903 afgeronde taken), zonder korte wachttijd. Ook het wisselen naar "Alle" doet dat meteen.

Daarbij toont de pagina niets tot alle taken binnen zijn: één grote laadbalk in plaats van een lijst die zich vult.

## Wat we gaan doen

1. **Lijst in stukken tonen.** Standaard de eerste ~50 regels, met een knop "Meer laden" en automatisch bijladen bij doorscrollen. De statuskeuzelijst per regel wordt pas opgebouwd wanneer je die regel aanwijst; tot dan staat er alleen het statuslabel.
2. **Zoekhulp in de database toevoegen** op status, vervaldatum, toegewezen persoon en de koppelingen naar bedrijf/contactpersoon/aanvraag/reservering. Ophalen van de openstaande taken wordt daarmee merkbaar sneller.
3. **Zoeken met korte vertraging** (ongeveer een derde seconde) en het archief pas laden wanneer dat echt nodig is; tijdens dat laden een klein "archief laden"-berichtje in plaats van een leeg scherm.
4. **Lijst vult zich direct.** Kop met aantallen en filters verschijnen meteen; alleen de lijst zelf krijgt kort de placeholder-regels.
5. **Tellingen en filtering in één doorloop** in plaats van vijf keer de hele lijst aflopen bij elke toetsaanslag.

## Nalopen van de eerdere wensen

Ik loop in dezelfde ronde de punten van de vorige twee opdrachten na en herstel wat nog niet klopt:

- Menubalk: naam links, menu in het midden, knoppen rechts — ook op smalle schermen.
- Het volledige pad bovenaan alle detailpagina's (bedrijf › contactpersoon › aanvraag › reservering/taak) en de melding bij een ontbrekende koppeling.
- Offertes/facturen zijn nergens meer in het CRM zichtbaar, terwijl de knop "Offerte klaarzetten" en het doorsturen van de gegevens blijven werken.
- De klantenkaart per bedrijf: kerncijfers, contactpersonen, gespreksverslagen, taken met aanvraagnaam, aanvragen, opties, eerdere aanvragen.

Afwijkingen die ik daarbij vind, los ik op; grotere vondsten meld ik apart in plaats van er stilzwijgend iets nieuws bij te bouwen.

## Technische details

- Migratie met indexen op `tasks`: `(status, due_date)`, `(assigned_to, status)`, `inquiry_id`, `contact_id`, `company_id`, `booking_id`. Geen schemawijziging, geen RLS-wijziging.
- `TasksPage.tsx`: `visibleCount`-state (50, stap 50) plus `IntersectionObserver`-sentinel; rij-`Select` alleen renderen bij hover/focus; `filteredTasks` en `counts` in één `useMemo`-reduce; `search` via debounced value voor zowel filtering als `loadAllTasks`.
- `TasksContext`: skeleton-gate beperken tot de lijst (`loading` blijft, pagina rendert kop/filters direct); `allLoaded`-refetch houdt bestaande `or`-filter.
- Verificatie: `bunx tsgo --noEmit`, `EXPLAIN ANALYZE` op de open-taken-query voor/na index, en een browsercontrole van `/tasks` met ingelogde sessie (indien beschikbaar).

## Buiten scope

- Geen wijzigingen in de GHL-synchronisatie, taaklogica of huisstijl.
- Geen server-side paginering met filters in de database (grotere ombouw); alleen als na de meting nodig blijkt, stel ik dat apart voor.
