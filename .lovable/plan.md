## Kostenplaats leeg = "n.v.t."

Als er geen kostenplaats is ingevuld, staat er voortaan "n.v.t." in plaats van de bedrijfsnaam — op de offerte, de reserveringsbevestiging en op het aanvraagscherm.

### Wijzigingen
1. `supabase/functions/_shared/reservering.ts` — `resolveKostenplaats`: lege waarde geeft `'n.v.t.'` (geen terugval op bedrijfsnaam meer). Commentaar bijwerken.
2. `supabase/functions/_shared/reservering.test.ts` — verwachtingen voor lege kostenplaats (regels 30 en 92) aanpassen naar `'n.v.t.'`; test draaien.
3. `src/components/inquiry/InquiryDetailsTab.tsx`
   - Weergave (r. 322): `kostenplaatsOpgeslagen || 'n.v.t.'`.
   - Placeholder (r. 263): "Bijv. KP-2026/014 (leeg = n.v.t.)".
4. Edge functions stage-offerte en stage-reservering opnieuw deployen. Niet publiceren.

Niet aangeraakt: `generate-quote-pdf` (oude `<kostenplaats>`-placeholder die bedrijfsnaam invult) — blijft zoals het is, tenzij je wilt dat ik die ook omzet.
