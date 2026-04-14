

## Plan: Toelichting verplaatsen van kaart naar historie

De `statusReason` (toelichting) wordt verwijderd van de detailkaart en wordt alleen zichtbaar in de historie-sectie via de gelogde `contact_activities`.

### Wat er verandert

1. **InquiryDetailsTab.tsx** — Regel 184 verwijderen: de `InfoRow` met `statusReason` wordt weggehaald uit de detailkaart.

Dat is alles. De toelichting wordt al automatisch gelogd als activiteit bij de contactpersoon (via de `logActivity` calls in `InquiryDetailPage.tsx`), dus die is altijd terug te vinden in de historie/tijdlijn. Er hoeft geen nieuwe code geschreven te worden.

### Technisch

- Eén regel verwijderen in `src/components/inquiry/InquiryDetailsTab.tsx` (regel 184)
- De `statusReason` blijft in de database opgeslagen en wordt nog steeds gelogd naar `contact_activities` — alleen de weergave op de kaart verdwijnt

