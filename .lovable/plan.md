# Aanvragen sneller binnen, juiste gegevens en correcte hoofdletters

Drie losse problemen, met per punt wat er gebeurt en wat we aanpassen.

## 1. Aanvragen komen te laat binnen

Wat we hebben gevonden: de automatische synchronisatie draait maar **één keer per 30 minuten** (geplande taak `*/30 * * * *`). In het synchronisatielogboek van de afgelopen 10 dagen staan uitsluitend `auto-sync-run` regels — geen enkele webhook-melding. Nieuwe aanvragen worden dus in de praktijk pas bij de volgende halfuur-ronde opgepikt.

Aanpak:
- Frequentie van de geplande synchronisatie verhogen naar elke 5 minuten (lichte ronde), met de volledige ronde op een lager tempo, zodat we binnen de API-limieten blijven.
- Inkomende webhooks van VirtuGrow/GHL vastleggen in het synchronisatielogboek, zodat zichtbaar wordt of realtime meldingen daadwerkelijk aankomen. Eerste stap voor de bouw: nagaan of de webhook nog geregistreerd staat en, als die niet aankomt, de aanvraag-ingang op de webhook opnieuw activeren (dan is een nieuwe aanvraag binnen seconden zichtbaar in plaats van minuten).

## 2. Ingevulde gegevens komen niet goed in het CRM

Voorbeelden uit de huidige data:
- ANV-001831: onderwerp staat als "Sandra Klerkx-Jonk - Aanvraag" (de naam van de kans in GHL) in plaats van het type gelegenheid; in de berichttekst staat "Bedrijfsnaam: Marktechnical B.V." maar er is **geen bedrijf gekoppeld**.
- ANV-001827 en ANV-001826: aantal gasten staat op 0 terwijl het formulier is ingevuld.

Aanpak:
- Veldherkenning uitbreiden en gelijktrekken tussen webhook en synchronisatie: aantal gasten, gewenste datum, begin-/eindtijd, type gelegenheid, zaalvoorkeur en budget worden herkend ongeacht schrijfwijze of veld-ID.
- Bedrijfsnaam uit het formulier gebruiken om het bedrijf te koppelen (bestaand bedrijf zoeken op naam; anders aanmaken en koppelen aan contactpersoon en aanvraag).
- Type gelegenheid alleen uit de kansnaam halen als er echt geen formulierveld is; nooit "Naam - Aanvraag" als onderwerp laten staan.
- Verrijking direct na het aanmaken van de aanvraag uitvoeren en opnieuw proberen bij een API-limiet, zodat velden niet leeg blijven.
- Bestaande aanvragen van de laatste periode eenmalig opnieuw verrijken, zodat de al binnengekomen aanvragen ook kloppen.

## 3. Hoofdletters: tussenvoegsels en IJ

Oorzaak gevonden: op de tabel met contactpersonen staat nog een oude databasetrigger die voor- en achternaam door `initcap` haalt. Die maakt van "van der Berg" → "Van Der Berg" en van "IJsbrand" → "Ijsbrand". Dit gebeurt bij elke opslag en dus voor **iedere medewerker**, ongeacht wat er is ingetypt. De nieuwere normalisatie voor tussenvoegsels draait alleen als naamvelden meeveranderen en repareert de IJ niet.

Aanpak:
- Het automatisch omzetten naar hoofdletters (`initcap`) uit die trigger verwijderen; de trigger blijft wel het bedrijf koppelen.
- De normalisatie beperken tot precies één regel: tussenvoegsels (van, de, den, der, ten, ter, op de, ...) altijd klein, midden in de naam. Al ingetypte hoofdletters van de medewerker blijven verder ongewijzigd, dus IJ, van der IJssel, McDonald en dubbele namen blijven staan.
- Dezelfde regel geldt aan de invoerzijde in het systeem, zodat er geen verschil is tussen handmatig invoeren en synchronisatie.
- Eenmalige correctie over bestaande contactpersonen, bedrijven en de namen op aanvragen/reserveringen: "Van Der" → "van der" en Nederlandse IJ-namen (Ijsbrand, Ijzer..., Ijmuiden...) terug naar IJ.

## Technische details

- Geplande taak: `cron.job` id 4 aanpassen (5 min licht / 30 min volledig via parameter in de aanroep).
- Database: `public.auto_link_company_id()` opnieuw definiëren zonder `initcap`; `public.normalize_dutch_name_particles()` uitbreiden met woord-voor-woord verwerking (tussenvoegsels klein, IJ-correctie) en de trigger op contactpersonen op alle kolommen laten draaien in plaats van alleen bij naamwijziging.
- Frontend: `capitalizeWords` in `src/lib/utils.ts` afstemmen op dezelfde regel (inclusief IJ) en gebruiken in de contact-, bedrijf- en aanvraagformulieren.
- Edge functions: veldherkenning in `ghl-webhook` en `ghl-auto-sync` samenbrengen in één gedeelde mapping (aantal gasten, datum, tijden, gelegenheid, zaal, budget, bedrijfsnaam) en bedrijfskoppeling op naam toevoegen; `ghl-enrich-inquiry` opnieuw proberen bij status 429.
- Eenmalige herstelmigratie voor bestaande namen, plus een eenmalige verrijkingsronde over recente aanvragen.
