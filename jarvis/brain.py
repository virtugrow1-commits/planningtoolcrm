"""
Het brein van Jarvis (Fase 2).

Gebruikt de officiële Anthropic SDK. Claude krijgt de CRM-functies uit tools.py
als tools en beslist zelf wanneer het je GoHighLevel raadpleegt of aanpast.
De gespreksgeschiedenis blijft bewaard, zodat je kunt doorpraten.
"""
from __future__ import annotations

from anthropic import Anthropic

import config
from ghl_client import GHLClient
from tools import TOOLS, dispatch

SYSTEM_PROMPT = """\
Je bent Jarvis, een persoonlijke assistent voor een ondernemer die het CRM
GoHighLevel gebruikt. Je helpt met contacten, aanvragen, pipelines, afspraken
en berichten.

Richtlijnen:
- Antwoord in het Nederlands, bondig en behulpzaam.
- Gebruik de beschikbare tools om ECHTE data uit het CRM te halen; verzin nooit
  gegevens. Weet je iets niet, gebruik dan een tool of zeg het eerlijk.
- Voor acties die iets wijzigen of extern versturen (contact aanmaken, tags
  toevoegen, een SMS/e-mail sturen): vraag ALTIJD eerst kort om bevestiging.
- Als je een contact-id nodig hebt, zoek dan eerst het contact op via naam.
- Vat lijsten kort samen in plaats van rauwe data te tonen.
"""


class Jarvis:
    def __init__(self) -> None:
        config.require_ghl()
        config.require_anthropic()
        self.client = Anthropic(api_key=config.ANTHROPIC_API_KEY)
        self.ghl = GHLClient()
        self.model = config.ANTHROPIC_MODEL
        self.messages: list[dict] = []

    def ask(self, user_text: str, *, verbose: bool = True) -> str:
        """Stel Jarvis een vraag; hij mag zelf CRM-tools gebruiken."""
        self.messages.append({"role": "user", "content": user_text})

        while True:
            resp = self.client.messages.create(
                model=self.model,
                max_tokens=8000,
                system=SYSTEM_PROMPT,
                thinking={"type": "adaptive"},
                tools=TOOLS,
                messages=self.messages,
            )

            # Bewaar het volledige antwoord (incl. thinking/tool_use-blokken)
            self.messages.append({"role": "assistant", "content": resp.content})

            if resp.stop_reason == "refusal":
                return "Sorry, dat verzoek kan ik niet uitvoeren."

            if resp.stop_reason == "tool_use":
                tool_results = []
                for block in resp.content:
                    if block.type != "tool_use":
                        continue
                    if verbose:
                        print(f"   · Jarvis raadpleegt CRM: {block.name}...")
                    result, is_error = dispatch(self.ghl, block.name, block.input or {})
                    tool_results.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": result,
                            "is_error": is_error,
                        }
                    )
                self.messages.append({"role": "user", "content": tool_results})
                continue  # laat Claude verder redeneren met de resultaten

            # Klaar: haal de tekst uit het antwoord
            return "".join(b.text for b in resp.content if b.type == "text").strip()

    def reset(self) -> None:
        """Begin een nieuw gesprek."""
        self.messages = []
