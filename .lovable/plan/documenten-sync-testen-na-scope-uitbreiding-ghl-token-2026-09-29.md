# Documenten-sync testen na scope-uitbreiding GHL-token

## Situatie
De bestaande GHL-token is in GoHighLevel bijgewerkt met het leesrecht "Documents & Contracts". De sleutel in de app blijft ongewijzigd — er hoeft niets opnieuw opgeslagen te worden.

## Stappen

1. **Documenten-sync eenmalig handmatig aanroepen**
   - Alleen de documenten-stap van de sync draaien (geen volledige sync).
   - Let op: de sync slaat documenten 24 uur over na een weigering. Die blokkade moet voor de test worden gereset (tabelveld bijwerken), zodat de test direct eerlijk is.

2. **Resultaat controleren**
   - Verwacht: geen "GHL denied access" meer in de logs.
   - Rapporteren hoeveel documenten zijn opgehaald en gekoppeld.

3. **Visuele controle in de preview**
   - Kijken of documenten zichtbaar zijn bij klanten/aanvragen.

## Buiten scope
- Geen code- of UI-wijzigingen (alleen eventueel de 24u-blokkade resetten).
- Niets publiceren; live blijft de oude versie.
