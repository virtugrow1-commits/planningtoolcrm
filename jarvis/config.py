"""Centrale configuratie: laadt sleutels uit .env en valideert ze."""
from __future__ import annotations

import os
from dotenv import load_dotenv

# Laad .env uit deze map (jarvis/.env)
load_dotenv()

GHL_TOKEN = os.getenv("GHL_TOKEN", "").strip()
GHL_LOCATION_ID = os.getenv("GHL_LOCATION_ID", "").strip()
GHL_API_VERSION = os.getenv("GHL_API_VERSION", "2021-07-28").strip()

GHL_BASE_URL = "https://services.leadconnectorhq.com"


def require_ghl() -> None:
    """Stopt met een duidelijke melding als de GHL-sleutels ontbreken."""
    missing = []
    if not GHL_TOKEN:
        missing.append("GHL_TOKEN")
    if not GHL_LOCATION_ID:
        missing.append("GHL_LOCATION_ID")
    if missing:
        raise SystemExit(
            "\n[Configuratie] Ontbrekende waarden in .env: "
            + ", ".join(missing)
            + "\nKopieer .env.example naar .env en vul je sleutels in.\n"
        )
