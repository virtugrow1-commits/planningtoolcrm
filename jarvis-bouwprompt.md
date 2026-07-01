# Jarvis Bouwprompt — Voice-assistent gekoppeld aan GoHighLevel

> Plak de tekst hieronder (vanaf "=== START PROMPT ===") in **Claude Code**,
> gestart in een **lege projectmap**. Bouw fase voor fase.
> Zet je GHL-token NOOIT in de prompt — die komt in een `.env`-bestand.

---

=== START PROMPT ===

Ik wil een persoonlijke spraakassistent ("Jarvis") bouwen die gekoppeld is aan
mijn CRM (GoHighLevel). Bouw dit in **Python**. Werk in duidelijke fases en zorg
dat elke fase werkt en getest is voordat je verdergaat. Leg onderweg kort uit wat
je doet.

## Randvoorwaarden
- Alle geheimen (API-keys, tokens) in een `.env`-bestand, geladen met
  `python-dotenv`. Voeg `.env` toe aan `.gitignore`. Maak ook een
  `.env.example` met lege placeholders.
- Schrijf nette, gedocumenteerde code met een duidelijke mappenstructuur.
- Maak een `README.md` met installatie- en gebruiksinstructies (setup van
  virtualenv, `pip install -r requirements.txt`, hoe te starten).
- Voeg per fase een klein testscript of testcommando toe zodat ik kan
  controleren of het werkt.

## Fase 1 — Koppeling met GoHighLevel (eerst dit laten werken)
- Maak een module `ghl_client.py` die praat met de GoHighLevel API v2
  (LeadConnector). Ik gebruik een **Private Integration token** (Bearer-auth,
  header `Authorization: Bearer <token>` en `Version: 2021-07-28`).
  Basis-URL: https://services.leadconnectorhq.com
- Implementeer functies voor de meest gebruikte acties:
  - contacten zoeken/ophalen (op naam, e-mail, telefoon)
  - een contact aanmaken en bijwerken (tags, custom fields, pipeline stage)
  - afspraken/opportunities ophalen en aanmaken
  - een sms of e-mail sturen naar een contact
  - recente gesprekken/berichten van een contact ophalen
- Lees mijn `GHL_TOKEN` en `GHL_LOCATION_ID` uit `.env`.
- Voeg nette foutafhandeling en logging toe (rate limits, 401/403 netjes melden).
- Schrijf een `test_ghl.py` dat een simpele read-actie doet (bijv. eerste 5
  contacten ophalen) zodat ik zie dat de koppeling werkt.
- Belangrijk: gebruik zoveel mogelijk de directe API i.p.v. de browser namaken.

## Fase 2 — Het "brein" (LLM met tools/function calling)
- Bouw een assistent-laag die een groot taalmodel gebruikt (maak het model
  configureerbaar; standaard Anthropic Claude via de officiële SDK, met
  `ANTHROPIC_API_KEY` uit `.env`).
- Registreer de GHL-functies uit fase 1 als **tools/function calls** zodat het
  model zelf kan beslissen wanneer het mijn CRM raadpleegt of aanpast.
- Onderhoud gespreksgeschiedenis zodat ik kan doorpraten over eerdere antwoorden.
- Maak eerst een **tekst-chat in de terminal** (`chat.py`): ik typ, Jarvis
  antwoordt en gebruikt waar nodig de CRM-tools. Test dit grondig.
- Voeg een systeemprompt toe die Jarvis een behulpzame, bondige persoonlijkheid
  geeft en die uitlegt welke CRM-acties beschikbaar zijn.

## Fase 3 — Stem (spraak in en uit)
- Voeg spraakherkenning toe (spraak → tekst). Maak dit configureerbaar:
  standaard OpenAI Whisper (mag lokaal `faster-whisper` of via API).
- Voeg tekst-naar-spraak toe voor de "Jarvis-stem". Maak dit configureerbaar:
  standaard ElevenLabs (`ELEVENLABS_API_KEY` uit `.env`), met een gratis lokaal
  alternatief (bijv. `pyttsx3` of Piper) als fallback.
- Optioneel: een "wake word" ("Hey Jarvis") met Picovoice Porcupine.
- Maak een `voice.py` / `jarvis.py` die de flow verbindt:
  microfoon → tekst → brein (fase 2) → antwoord → stem.

## Fase 4 — Extra: browser & lokale bestanden (alleen als API iets niet kan)
- Voeg een optionele browser-tool toe met Playwright, zodat Jarvis een website
  kan openen en simpele acties kan doen die NIET via de GHL API kunnen.
  Vraag altijd om bevestiging voordat hij iets verstuurt of wijzigt.
- Voeg een optionele "bestanden"-tool toe die ALLEEN toegang heeft tot een door
  mij opgegeven map (uit `.env`, bijv. `WORKDIR`). Nooit mijn hele computer.
- Bouw duidelijke veiligheidsgrenzen: destructieve of externe acties eerst
  bevestigen.

## Aan het eind
- Geef me een overzicht van welke `.env`-variabelen ik moet invullen en waar ik
  elke sleutel vandaan haal.
- Geef een korte lijst met voorbeeldcommando's die ik tegen Jarvis kan zeggen.

Begin nu met **Fase 1** en stop na fase 1 om mij te laten testen voordat je
verdergaat.

=== EINDE PROMPT ===

---

## Welke sleutels heb je nodig (in je `.env`)
- `GHL_TOKEN` — je GoHighLevel Private Integration token (heb je al) ✅
- `GHL_LOCATION_ID` — de ID van je GHL sub-account/locatie
- `ANTHROPIC_API_KEY` — voor het brein (Claude), via console.anthropic.com
- `ELEVENLABS_API_KEY` — voor de Jarvis-stem (optioneel, pas bij fase 3)
- `OPENAI_API_KEY` — alleen als je Whisper via de API wilt (optioneel)

## Volgorde-advies
1. Doe eerst **alleen Fase 1** en test of hij je contacten kan ophalen.
2. Dan **Fase 2** (typen tegen Jarvis, hij bedient je CRM).
3. Pas als dat lekker werkt: **Fase 3** (stem) en eventueel **Fase 4** (browser).
