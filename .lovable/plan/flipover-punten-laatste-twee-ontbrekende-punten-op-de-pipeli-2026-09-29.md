# Flipover-punten: laatste twee ontbrekende punten op de pipelinekaart

## Controle: wat er al in zit (geverifieerd in de code)

**Klantkaart (foto 1)**
- Contactpersonen, Taken (algemeen), Aanvragen, Toekomstige reserveringen en Afgeronde reserveringen: allemaal aanwezig als eigen tabblad op de klantkaart, met aantallen.
- Adresgegevens: op tabblad Overzicht.

**Takenlijst**
- Zoeken doorzoekt al: taaktitel en -omschrijving, naam van de contactpersoon, bedrijfsnaam, en naam/nummer/type van de aanvraag (event). Hoofdletters en accenten maken niet uit.
- Filters op aanvraag, event, klanttype en periode zijn er ook.

**Hoofdletters en speciale tekens**
- Nederlandse tussenvoegsels (van, de, van der) blijven klein; kapotte tekens (CafÃ → Café) zijn hersteld.

**Aanmaken in CRM**
- Keuze Particulier of Bedrijf zit in het klantformulier; bij Particulier vraagt hij voor- en achternaam.

**Pipelinekaart (foto 2)**
- Koppeling bedrijf: aanwezig (klikbare bedrijfsregel).
- Primaire contactpersoon van deze aanvraag: aanwezig ("Primair: …").
- Taken alleen binnen dit salesproces: aanwezig (volgende taak per aanvraag + takenfilter op aanvraag).

## Wat ontbreekt (dit plan)

Op de pipelinekaart bij elke aanvraag:

1. **Gegevens van de primaire contactpersoon tonen**: e-mail, mobiel nummer en verjaardag in formaat dd-MM-jjjj (alleen regels die gevuld zijn).
2. **2e en 3e contactpersoon tonen**: onder de primaire, elk op een eigen regel met naam (klikbaar naar de contactpagina), gebaseerd op de gekoppelde contactpersonen van de aanvraag.

## Technische aanpak

- Alleen `src/pages/InquiriesPage.tsx` (pipelinekaart): primaire contactpersoon ophalen via `resolveContact` (gebeurt al) en daar `email`, `phone` en `dateOfBirth` tonen; extra contactpersonen via de bestaande aanvraag-contactenlijst (`inquiry_contacts`), maximaal 2 extra regels.
- Geen database-wijzigingen, geen wijzigingen aan synchronisatie met GHL, geen andere schermen.
- Verjaardag wordt getoond als dd-MM-jjjj, consistent met de rest van de app.

## Controle na afloop

- Typecheck draaien.
- In de preview een aanvraag met meerdere contactpersonen openen in de pipeline en visueel controleren: primair met e-mail/mobiel/verjaardag, 2e en 3e cp eronder.
- Niets publiceren; de live versie blijft de oude.
