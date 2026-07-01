# Jarvis — spraakassistent gekoppeld aan GoHighLevel

Een persoonlijke assistent die je CRM (GoHighLevel) kan raadplegen en bedienen,
en waar je straks ook mee kunt práten. Gebouwd in fases zodat elk stuk werkt
voordat je verdergaat.

## Status
- ✅ **Fase 1 — GoHighLevel-koppeling** (contacten, pipelines, berichten, agenda)
- ⬜ Fase 2 — Het brein (Claude met tools) + tekst-chat
- ⬜ Fase 3 — Stem (spraak in/uit)
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

## Volgende stap
Werkt Fase 1? Dan bouwen we **Fase 2**: het brein (Claude) dat deze functies
zelf als tools aanroept, met een chat in de terminal.
