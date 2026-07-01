# Jarvis — spraakassistent gekoppeld aan GoHighLevel

Een persoonlijke assistent die je CRM (GoHighLevel) kan raadplegen en bedienen,
en waar je straks ook mee kunt práten. Gebouwd in fases zodat elk stuk werkt
voordat je verdergaat.

## Status
- ✅ **Fase 1 — GoHighLevel-koppeling** (contacten, pipelines, berichten, agenda)
- ✅ **Fase 2 — Het brein** (Claude met tools) + tekst-chat
- ✅ **Fase 3 — Stem** (spraak in/uit)
- ⬜ Fase 4 — Browser & bestanden (optioneel)

---

## Installatie

Je hebt **Python 3.10+** nodig.

```bash
cd jarvis

# 1. Virtuele omgeving (aanbevolen)
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# 2. Pakketten installeren
pip install -r requirements.txt

# 3. Sleutels invullen
cp .env.example .env
# open .env en vul GHL_TOKEN in (GHL_LOCATION_ID staat er al)
```

### Waar haal je de GHL_TOKEN?
In GoHighLevel: **Settings → Private Integrations → New Integration**.
Geef 'm rechten (scopes) voor o.a. *Contacts*, *Opportunities*, *Conversations*
en *Calendars*. Kopieer het token naar `GHL_TOKEN` in je `.env`.

> ⚠️ Zet je token/keys NOOIT in code of in de chat — alleen in `.env`.
> `.env` staat in `.gitignore` en gaat niet naar git.

---

## Testen (Fase 1)

```bash
python test_ghl.py
```

Dit doet alleen lees-acties. Zie je je contacten/pipelines verschijnen, dan
werkt de koppeling. 🎉

---

## Wat kan de client nu al? (`ghl_client.py`)

| Functie | Wat het doet |
|---------|--------------|
| `search_contacts(query)` | Contact zoeken op naam/e-mail/telefoon |
| `list_contacts(limit)` | Eerste N contacten ophalen |
| `get_contact(id)` | Eén contact volledig ophalen |
| `create_contact(...)` | Nieuw contact aanmaken |
| `update_contact(id, ...)` | Velden/tags bijwerken |
| `add_tags(id, tags)` | Tags toevoegen |
| `search_opportunities()` | Deals/opportunities ophalen |
| `list_pipelines()` | Pipelines + stages ophalen |
| `get_conversations(id)` | Gesprekken van een contact |
| `send_message(id, tekst)` | SMS/e-mail sturen |
| `list_calendars()` | Agenda's ophalen |

---

## Fase 2 — Praten via tekst (het brein)

Zorg dat je `ANTHROPIC_API_KEY` in `.env` staat (maak er een aan op
console.anthropic.com), dan:

```bash
python chat.py
```

Nu kun je in gewone taal met Jarvis praten en bedient hij je CRM. Voorbeelden:
- "Hoeveel contacten heb ik?"
- "Zoek het contact Jan de Vries en vat zijn laatste gesprekken samen."
- "Welke pipelines heb ik en hoeveel deals staan er open?"
- "Voeg de tag 'VIP' toe aan dat contact." (vraagt eerst bevestiging)

Jarvis gebruikt het model `claude-opus-4-8` en roept zelf de juiste CRM-tools
aan. Wijzigende acties (contact aanmaken, tags, berichten sturen) worden altijd
eerst ter bevestiging voorgelegd.

## Fase 3 — Praten met je stem

Installeer de (optionele) stem-pakketten:

```bash
pip install faster-whisper sounddevice elevenlabs pyttsx3
```

Optioneel: zet `ELEVENLABS_API_KEY` in `.env` voor een natuurlijke stem
(anders wordt de gratis systeemstem `pyttsx3` gebruikt). Dan:

```bash
python jarvis.py
```

Druk op **Enter** om te spreken, of typ gewoon je vraag. Jarvis luistert,
denkt na, bedient je CRM en antwoordt met stem.

---

## Bestanden in het kort
| Bestand | Fase | Doel |
|---------|------|------|
| `ghl_client.py` | 1 | GoHighLevel-koppeling |
| `test_ghl.py` | 1 | Koppeling testen |
| `tools.py` | 2 | CRM-functies als tools voor Claude |
| `brain.py` | 2 | Het brein (Claude + tool-loop) |
| `chat.py` | 2 | Tekst-chat in de terminal |
| `voice.py` | 3 | Spraak in (Whisper) en uit (ElevenLabs/pyttsx3) |
| `jarvis.py` | 3 | Volledige spraak-assistent |

## Volgende stap (Fase 4, optioneel)
Browserbesturing (Playwright) en toegang tot een specifieke map met bestanden —
alleen voor dingen die de GHL API niet kan. Zeg het maar als je dat wilt.
