# Fix CRM Mapping voor BUUT formulier-inzendingen

## Root cause

In `supabase/functions/ghl-webhook/index.ts` → `handleFormSubmission()` wordt bij een bekend e-mailadres het **bedrijf van dat bestaande contact** overgenomen en het bedrijf uit het formulier genegeerd.

Concreet (regels ~198-291):

1. Contact wordt gematcht op `email` → `companyId` wordt gezet op het **oude** `company_id` van dat contact.
2. Stap 2 `if (!companyId && companyName)` slaat het opzoeken/aanmaken van het ingediende bedrijf over omdat `companyId` al gevuld is.
3. Stap 3 `else if (companyId)` update `contacts.company_id` alleen als die `NULL` is — bestaande koppeling blijft dus staan.
4. `inquiries` insert zet **geen** `company_id`, dus de opportunity erft impliciet het bedrijf via `contact_id` (auto-trigger `auto_set_company_from_contact`) → wijst naar het oude bedrijf.

Test 3 (Sjors Jochems / Mijzo) landt daardoor onder "Jochems Development BV".

Bijkomend:
- Company-match is `ilike` zonder normalisatie (`BV` vs `B.V.`, extra spaties) → soms terecht een nieuw bedrijf, soms onterecht een match.
- Contact-match puur op e-mail: als iemand met privé-adres voor 2 bedrijven inzendt, wordt altijd hetzelfde contact hergebruikt.
- Dedup-blokken 4a/4b/4c updaten `inquiries` maar zetten daar ook geen `company_id`.

## Fix

Herschrijf `handleFormSubmission` zo dat het **ingediende bedrijf altijd leidend** is:

### 1. Company eerst resolven (los van contact)

```text
if companyName:
  submittedCompanyId = find company by normalized name (trim, collapse spaces,
                        strip trailing punctuation, case-insensitive)
  if not found: insert new company (name, kvk, btw)
else:
  submittedCompanyId = null
```

Nooit meer het `company_id` van een bestaand contact als "de company" van deze inzending gebruiken.

### 2. Contact matchen — strenger

Match-volgorde:
1. `ghl_contact_id` (hardste identiteit)
2. `email` **AND** (`company_id = submittedCompanyId` OR contact heeft nog geen company)
3. Anders: nieuw contact aanmaken, ook als het e-mailadres al bestaat bij een ander bedrijf (voorkomt cross-linking Mijzo ↔ Jochems).

Bij een match: als `submittedCompanyId` afwijkt van `contact.company_id`, laat de bestaande primary-koppeling staan maar voeg een extra rij toe in `contact_companies` (contact ↔ submittedCompanyId, `is_primary=false`). Overschrijf `contacts.company_id` niet automatisch — dat zou historische opportunities kapot maken.

### 3. Inquiry altijd expliciet aan submittedCompanyId koppelen

- Voeg `company_id: submittedCompanyId` toe aan **elke** `inquiries` insert én aan de update-paden 4a/4b/4c.
- Dedup 4a/4b/4c aanscherpen: match alleen als `contact_id` + `event_type` + `company_id` gelijk zijn, zodat een tweede aanvraag van hetzelfde contact voor een ander bedrijf een nieuwe inquiry wordt in plaats van de vorige te overschrijven.
- Bewaar submitted `email`/`phone` op contact-niveau als het contact nieuw is; bij een bestaand contact niet overschrijven (behoudt schone data).

### 4. Structured logging per submissie

Eén `console.log` per stap met een vaste prefix `[FORM]` zodat je in Edge Logs de hele flow kunt volgen:

```text
[FORM] incoming { email, companyName, fullName, formSource, ghlContactId }
[FORM] company.resolved { submittedCompanyId, matchedExisting: bool, createdNew: bool }
[FORM] contact.resolved { contactId, matchedBy: 'ghl'|'email+company'|'created', reusedExisting: bool }
[FORM] contact_companies.linked { contactId, companyId, isPrimary }
[FORM] inquiry.upserted { inquiryId, action: 'insert'|'update-4a'|'update-4b'|'update-4c', company_id, contact_id }
```

### 5. Company-naam normalisatie helper

Kleine helper `normalizeCompanyName(s)` (lowercase, `B.V.`/`BV`/`bv` uniformeren, dubbele spaties weg) gebruikt in stap 1 om terugkerende duplicaten te voorkomen zonder verkeerde matches (bv. "Mijzo" ≠ "Mijzo Zorg").

## Test-verificatie

Na deploy: drie curl-runs tegen `ghl-webhook` met de payloads uit de drie testcases, en per run de Edge Logs controleren op de `[FORM]`-regels. Verwacht resultaat:

- **Test 1**: nieuw of hergebruikt "Jochems Development BV", contact "Test", inquiry.company_id = Jochems.
- **Test 2**: zelfde "Jochems Development BV", nieuw contact, nieuwe inquiry op Jochems.
- **Test 3**: company "Mijzo" (nieuw of bestaand), contact "Sjors Jochems" (nieuw record ook al bestaat het e-mailadres onder Jochems), inquiry.company_id = Mijzo.

Daarna één handmatige controle in CRM UI dat de opportunity onder het juiste bedrijf verschijnt.

## Bestanden

- `supabase/functions/ghl-webhook/index.ts` — `handleFormSubmission` herschrijven (regels ~165-390), helper `normalizeCompanyName` toevoegen.

Geen DB-migratie nodig: `inquiries.company_id` en `contact_companies` bestaan al.

## Niet in scope

- UI-wijzigingen in CRM.
- `ghl-enrich-inquiry` (draait ná de match; erft de correcte `company_id` zodra webhook die goed zet).
- Backfill van bestaande foutief gekoppelde inquiries — apart traject indien gewenst.
