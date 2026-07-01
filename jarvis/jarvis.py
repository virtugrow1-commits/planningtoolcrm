"""
De volledige Jarvis met stem (Fase 3).

Flow:  microfoon → tekst (Whisper) → brein (Claude + CRM) → antwoord → stem.

Gebruik:
    python jarvis.py

Druk op Enter om te spreken, of typ je vraag. Zeg/typ 'stop' om te stoppen.
"""
from __future__ import annotations

from brain import Jarvis
from voice import Ears, Voice


def main() -> None:
    print("=" * 56)
    print("  J.A.R.V.I.S.  ·  spraakmodus")
    print("  Enter = spreken · typ tekst = typen · 'stop' = stoppen")
    print("=" * 56)

    jarvis = Jarvis()
    ears = Ears()
    voice = Voice()

    greeting = "Systemen online. Waarmee kan ik je helpen?"
    print(f"\nJARVIS› {greeting}\n")
    voice.say(greeting)

    while True:
        try:
            cmd = input("Jij› (Enter = spreken) ").strip()
        except (EOFError, KeyboardInterrupt):
            break

        if cmd.lower() in {"stop", "exit", "quit"}:
            break

        if cmd == "":
            user = ears.listen(seconds=5.0)
            print(f"Jij (gesproken)› {user}")
        else:
            user = cmd

        if not user:
            print("   · Niets verstaan, probeer opnieuw.\n")
            continue
        if user.lower().startswith("stop"):
            break

        answer = jarvis.ask(user)
        print(f"\nJARVIS› {answer}\n")
        voice.say(answer)

    print("JARVIS› Tot ziens.")
    voice.say("Tot ziens.")


if __name__ == "__main__":
    main()
