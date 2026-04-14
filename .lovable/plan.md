

## Plan: Stadiumwijzigingen automatisch loggen in gesprekhistorie

Wanneer een aanvraag wordt aangepast (stadium gewijzigd via het dialoog of via de status-dropdown, of gegevens bewerkt), wordt dit automatisch vastgelegd als een activiteit bij de contactpersoon. Zo is altijd terug te zien wat er wanneer is gewijzigd.

### Wat er verandert

1. **Stadium wijzigen via dialoog** (`InquiryDetailPage.tsx`, regel 288-292)
   - Na het opslaan van de stadiumwijziging wordt automatisch een `contact_activity` aangemaakt met:
     - Type: `note`
     - Onderwerp: "Stadium gewijzigd → [nieuw stadium label]"
     - Body: de ingevulde reden/toelichting
   - Dit gebeurt alleen als er een gekoppelde contactpersoon is

2. **Stadium wijzigen via header dropdown** (`InquiryDetailPage.tsx`, regel 149-152)
   - Ook hier wordt een activiteit gelogd met het oude en nieuwe stadium

3. **Aanvraag bewerken en opslaan** (`InquiryDetailPage.tsx`, `saveEdit` functie, regel 115-125)
   - Na het opslaan van bewerkingen wordt een activiteit aangemaakt met een samenvatting van wat er is gewijzigd (bijv. "Aanvraag bewerkt – [evenement type]")

### Technisch

- Geen database-wijzigingen nodig — de `contact_activities` tabel bestaat al met de juiste kolommen (`type`, `subject`, `body`, `contact_id`, `user_id`)
- Alle logging gebeurt in `InquiryDetailPage.tsx` door na elke update een `supabase.from('contact_activities').insert(...)` aan te roepen
- De activiteiten zijn direct zichtbaar op de contactpersoon- en bedrijfsdetailpagina via de bestaande `ActivityTimeline` component

### Bestanden die worden aangepast

- `src/pages/InquiryDetailPage.tsx` — activiteit-logging toevoegen op 3 plekken (status dialoog, status dropdown, bewerkingen opslaan)

