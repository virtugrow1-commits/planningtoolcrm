"""
Tool-definities voor het brein (Fase 2).

Elke tool is een Python-functie uit ghl_client.py, hier beschreven als een
JSON-schema zodat Claude zelf kan beslissen wanneer het je CRM raadpleegt of
aanpast. `dispatch()` voert de gekozen tool uit.
"""
from __future__ import annotations

import json
from typing import Any

from ghl_client import GHLClient, GHLError

# ------------------------------------------------------------------
#  Tool-schema's (wat Claude ziet)
# ------------------------------------------------------------------
TOOLS: list[dict[str, Any]] = [
    {
        "name": "search_contacts",
        "description": (
            "Zoek contacten in het CRM op naam, e-mailadres of telefoonnummer. "
            "Gebruik dit als de gebruiker naar een specifieke persoon vraagt."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Zoekterm: naam, e-mail of telefoon"},
                "limit": {"type": "integer", "description": "Max. aantal resultaten (standaard 10)"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "list_contacts",
        "description": "Haal de eerste N contacten op. Handig voor een snel overzicht.",
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "description": "Aantal contacten (standaard 5)"},
            },
        },
    },
    {
        "name": "get_contact",
        "description": "Haal alle gegevens van één contact op via zijn contact-id.",
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string", "description": "De id van het contact"},
            },
            "required": ["contact_id"],
        },
    },
    {
        "name": "create_contact",
        "description": (
            "Maak een nieuw contact aan in het CRM. Vraag de gebruiker eerst om "
            "bevestiging voordat je dit doet."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "first_name": {"type": "string"},
                "last_name": {"type": "string"},
                "email": {"type": "string"},
                "phone": {"type": "string"},
                "tags": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["first_name"],
        },
    },
    {
        "name": "add_tags",
        "description": "Voeg één of meer tags toe aan een bestaand contact.",
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string"},
                "tags": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["contact_id", "tags"],
        },
    },
    {
        "name": "list_pipelines",
        "description": "Toon alle pipelines en hun stages (fases).",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "search_opportunities",
        "description": "Haal deals/opportunities op uit de pipeline.",
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "description": "Aantal (standaard 20)"},
            },
        },
    },
    {
        "name": "get_conversations",
        "description": "Haal de recente gesprekken/berichten van een contact op.",
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string"},
                "limit": {"type": "integer"},
            },
            "required": ["contact_id"],
        },
    },
    {
        "name": "send_message",
        "description": (
            "Stuur een SMS of e-mail naar een contact. Dit verstuurt echt een "
            "bericht — vraag ALTIJD eerst om bevestiging van de gebruiker."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string"},
                "message": {"type": "string"},
                "channel": {"type": "string", "enum": ["SMS", "Email"]},
            },
            "required": ["contact_id", "message"],
        },
    },
    {
        "name": "list_calendars",
        "description": "Toon de beschikbare agenda's/kalenders.",
        "input_schema": {"type": "object", "properties": {}},
    },
]


# ------------------------------------------------------------------
#  Uitvoering (wat er echt gebeurt)
# ------------------------------------------------------------------
def dispatch(client: GHLClient, name: str, args: dict[str, Any]) -> tuple[str, bool]:
    """Voer een tool uit. Retourneert (resultaat_als_tekst, is_error)."""
    try:
        if name == "search_contacts":
            data = client.search_contacts(args["query"], args.get("limit", 10))
        elif name == "list_contacts":
            data = client.list_contacts(args.get("limit", 5))
        elif name == "get_contact":
            data = client.get_contact(args["contact_id"])
        elif name == "create_contact":
            data = client.create_contact(
                first_name=args["first_name"],
                last_name=args.get("last_name", ""),
                email=args.get("email"),
                phone=args.get("phone"),
                tags=args.get("tags"),
            )
        elif name == "add_tags":
            data = client.add_tags(args["contact_id"], args["tags"])
        elif name == "list_pipelines":
            data = client.list_pipelines()
        elif name == "search_opportunities":
            data = client.search_opportunities(args.get("limit", 20))
        elif name == "get_conversations":
            data = client.get_conversations(args["contact_id"], args.get("limit", 20))
        elif name == "send_message":
            data = client.send_message(
                args["contact_id"], args["message"], args.get("channel", "SMS")
            )
        elif name == "list_calendars":
            data = client.list_calendars()
        else:
            return f"Onbekende tool: {name}", True

        return json.dumps(data, ensure_ascii=False, default=str), False

    except GHLError as exc:
        return f"CRM-fout: {exc}", True
    except KeyError as exc:
        return f"Ontbrekend verplicht veld: {exc}", True
    except Exception as exc:  # noqa: BLE001 - laatste vangnet
        return f"Onverwachte fout: {exc}", True
