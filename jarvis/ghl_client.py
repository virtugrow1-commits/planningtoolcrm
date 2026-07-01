"""
GoHighLevel (LeadConnector) API v2 client.

Doel: alle veelgebruikte CRM-acties bundelen in nette Python-functies, zodat
het "brein" (Fase 2) ze later als tools kan aanroepen.

Auth: Bearer-token (Private Integration) + header `Version`.
Docs: https://highlevel.stoplight.io/docs/integrations/
"""
from __future__ import annotations

import logging
from typing import Any, Optional

import requests

import config

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("ghl")


class GHLError(RuntimeError):
    """Nette fout met uitleg als de API iets teruggeeft dat niet klopt."""


class GHLClient:
    def __init__(
        self,
        token: str | None = None,
        location_id: str | None = None,
        version: str | None = None,
    ) -> None:
        self.token = token or config.GHL_TOKEN
        self.location_id = location_id or config.GHL_LOCATION_ID
        self.version = version or config.GHL_API_VERSION
        self.base_url = config.GHL_BASE_URL
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Authorization": f"Bearer {self.token}",
                "Version": self.version,
                "Accept": "application/json",
                "Content-Type": "application/json",
            }
        )

    # ---------- interne helper ----------
    def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict | None = None,
        json: dict | None = None,
    ) -> Any:
        url = f"{self.base_url}{path}"
        try:
            resp = self.session.request(
                method, url, params=params, json=json, timeout=30
            )
        except requests.RequestException as exc:  # netwerkfouten
            raise GHLError(f"Netwerkfout richting GHL: {exc}") from exc

        if resp.status_code == 401:
            raise GHLError(
                "401 Unauthorized — je GHL_TOKEN klopt niet of is verlopen."
            )
        if resp.status_code == 403:
            raise GHLError(
                "403 Forbidden — token mist rechten (scopes) voor deze actie."
            )
        if resp.status_code == 429:
            raise GHLError("429 — te veel verzoeken (rate limit). Even wachten.")
        if resp.status_code >= 400:
            raise GHLError(
                f"{resp.status_code} bij {method} {path}: {resp.text[:400]}"
            )
        if not resp.content:
            return {}
        return resp.json()

    # ---------- CONTACTEN ----------
    def search_contacts(self, query: str, limit: int = 10) -> list[dict]:
        """Zoek contacten op naam, e-mail of telefoon."""
        body = {
            "locationId": self.location_id,
            "page": 1,
            "pageLimit": limit,
            "query": query,
        }
        data = self._request("POST", "/contacts/search", json=body)
        return data.get("contacts", [])

    def list_contacts(self, limit: int = 5) -> list[dict]:
        """Haal de eerste N contacten op (handig als test)."""
        params = {"locationId": self.location_id, "limit": limit}
        data = self._request("GET", "/contacts/", params=params)
        return data.get("contacts", [])

    def get_contact(self, contact_id: str) -> dict:
        data = self._request("GET", f"/contacts/{contact_id}")
        return data.get("contact", data)

    def create_contact(
        self,
        first_name: str,
        last_name: str = "",
        email: str | None = None,
        phone: str | None = None,
        tags: Optional[list[str]] = None,
    ) -> dict:
        body: dict[str, Any] = {
            "locationId": self.location_id,
            "firstName": first_name,
            "lastName": last_name,
        }
        if email:
            body["email"] = email
        if phone:
            body["phone"] = phone
        if tags:
            body["tags"] = tags
        data = self._request("POST", "/contacts/", json=body)
        return data.get("contact", data)

    def update_contact(self, contact_id: str, **fields: Any) -> dict:
        """Werk velden bij, bv. tags=[...], firstName='...'."""
        data = self._request("PUT", f"/contacts/{contact_id}", json=fields)
        return data.get("contact", data)

    def add_tags(self, contact_id: str, tags: list[str]) -> dict:
        data = self._request(
            "POST", f"/contacts/{contact_id}/tags", json={"tags": tags}
        )
        return data

    # ---------- OPPORTUNITIES / PIPELINE ----------
    def search_opportunities(self, limit: int = 20) -> list[dict]:
        params = {"location_id": self.location_id, "limit": limit}
        data = self._request("GET", "/opportunities/search", params=params)
        return data.get("opportunities", [])

    def list_pipelines(self) -> list[dict]:
        params = {"locationId": self.location_id}
        data = self._request("GET", "/opportunities/pipelines", params=params)
        return data.get("pipelines", [])

    # ---------- GESPREKKEN / BERICHTEN ----------
    def get_conversations(self, contact_id: str, limit: int = 20) -> list[dict]:
        params = {
            "locationId": self.location_id,
            "contactId": contact_id,
            "limit": limit,
        }
        data = self._request("GET", "/conversations/search", params=params)
        return data.get("conversations", [])

    def send_message(
        self, contact_id: str, message: str, channel: str = "SMS"
    ) -> dict:
        """Stuur een bericht. channel: 'SMS' of 'Email'."""
        body = {
            "type": channel,
            "contactId": contact_id,
            "message": message,
        }
        return self._request("POST", "/conversations/messages", json=body)

    # ---------- AGENDA / AFSPRAKEN ----------
    def list_calendars(self) -> list[dict]:
        params = {"locationId": self.location_id}
        data = self._request("GET", "/calendars/", params=params)
        return data.get("calendars", [])


# Handige singleton voor snel gebruik
def default_client() -> GHLClient:
    config.require_ghl()
    return GHLClient()
