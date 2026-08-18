# Datum verplicht maken voor taken

## Doel
Overal waar een taak wordt aangemaakt of bewerkt, moet een datum verplicht worden ingevuld. Dit voorkomt dat taken zonder afloopdatum in het systeem komen.

## Te wijzigen schermen

| Scherm | Actie |
| --- | --- |
| Taken-overzicht (nieuwe taak) | Datumveld verplicht maken + validatie |
| Dashboard (nieuwe taak) | Datumveld verplicht maken + validatie |
| Dashboard (vervolgtaak) | Datum verplicht maken + validatie |
| Taak-detail (bewerken) | Datum verplicht maken + validatie |
| Taak-detail (vervolgtaak) | Datum verplicht maken (reeds gedeeltelijk, aanscherpen) |
| Contact-/Bedrijfs-/Aanvraag-detail (takenblok) | Datumkiezer toevoegen + verplicht maken |
| Aanvraag-detail (tabblad Taken) | Datumkiezer toevoegen + verplicht maken |
| Aanvragen-pagina (taak-dialoog) | Datumkiezer toevoegen + verplicht maken |

## Technisch

- Validatie: toon een toast met "Datum is verplicht" wanneer de gebruiker opslaat zonder datum.
- Labels: voorzie datumvelden van een `*` (verplicht-indicatie).
- UI: gebruik bestaande `Popover` + `Calendar` componenten waar geen datumkiezer staat.
- Datum verplicht; tijd blijft optioneel.

## Controle

- Een taak zonder datum kan nergens meer worden aangemaakt.
- Vervolgtaak na afronden: zonder datum verschijnt een foutmelding.
