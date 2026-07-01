"""
Praat met Jarvis in de terminal (Fase 2 — tekst).

Gebruik:
    python chat.py

Typ je vraag en Jarvis antwoordt, met gebruik van je CRM waar nodig.
Typ 'exit', 'quit' of 'stop' om te stoppen; 'reset' voor een nieuw gesprek.
"""
from __future__ import annotations

from brain import Jarvis


def main() -> None:
    print("=" * 56)
    print("  J.A.R.V.I.S.  ·  verbonden met GoHighLevel")
    print("  Typ je vraag. ('exit' = stoppen, 'reset' = nieuw gesprek)")
    print("=" * 56)

    jarvis = Jarvis()
    print("\nJARVIS› Systemen online. Waarmee kan ik je helpen?\n")

    while True:
        try:
            user = input("Jij› ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nJARVIS› Tot ziens.")
            break

        if not user:
            continue
        if user.lower() in {"exit", "quit", "stop"}:
            print("JARVIS› Tot ziens.")
            break
        if user.lower() == "reset":
            jarvis.reset()
            print("JARVIS› Nieuw gesprek gestart.\n")
            continue

        try:
            answer = jarvis.ask(user)
            print(f"\nJARVIS› {answer}\n")
        except Exception as exc:  # noqa: BLE001
            print(f"\n[fout] {exc}\n")


if __name__ == "__main__":
    main()
