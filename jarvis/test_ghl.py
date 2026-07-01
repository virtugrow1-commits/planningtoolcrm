"""
Snelle test van de GoHighLevel-koppeling (Fase 1).

Gebruik:
    python test_ghl.py

Dit doet ALLEEN lees-acties (niets wordt aangepast in je CRM):
  1. eerste paar contacten ophalen
  2. pipelines tonen
"""
from __future__ import annotations

import config
from ghl_client import GHLClient, GHLError


def main() -> None:
    config.require_ghl()
    client = GHLClient()

    print("== Verbinden met GoHighLevel ==")
    print(f"   Locatie: {config.GHL_LOCATION_ID}\n")

    try:
        print("1) Eerste contacten ophalen...")
        contacts = client.list_contacts(limit=5)
        if not contacts:
            print("   (geen contacten gevonden — koppeling werkt wel)\n")
        for c in contacts:
            naam = f"{c.get('firstName', '')} {c.get('lastName', '')}".strip()
            print(f"   - {naam or '(naamloos)':30} {c.get('email', '')}")
        print()

        print("2) Pipelines ophalen...")
        pipelines = client.list_pipelines()
        for p in pipelines:
            print(f"   - {p.get('name', '?')}  ({len(p.get('stages', []))} stages)")
        if not pipelines:
            print("   (geen pipelines gevonden)")
        print()

        print("✅ Koppeling met GoHighLevel werkt!")

    except GHLError as exc:
        print(f"\n❌ Er ging iets mis: {exc}")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
