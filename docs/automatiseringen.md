# CRM-automatiseringen (CliqCRM ↔ GoHighLevel)

Alle automatiseringen draaien in de edge function `crm-automations`:

- elke 10 minuten via `pg_cron` (job `crm-automations-10min`)
- direct na het opslaan van een reservering (`BookingsContext` roept de functie aan met `booking_id`)
- handmatig via **Instellingen → Automatiseringen → Nu uitvoeren** (of *Proefdraai* = `dry_run`, wijzigt niets)

Ze zijn **idempotent**: elke actie wordt vastgelegd in `automation_runs` (`dedupe_key`) en elke gegenereerde taak
krijgt een unieke `tasks.automation_key`. Opnieuw uitvoeren maakt dus nooit dubbele taken of dubbele statuswijzigingen.

## Onderdelen

| Instelling (`automation_settings.key`) | Wat het doet | Standaard |
| --- | --- | --- |
| `task_templates` | Taken uit `task_templates` aanmaken bij optie / reservering / annulering / offerte verzonden / getekend / na evenement / optie loopt af. Eén taak per gekozen collega, direct gepusht naar GHL. | aan (maar alle sjablonen staan **uit**) |
| `quote_documents` | GHL-document (offerte/contract) verzonden → aanvraag naar *Offerte verzonden*; getekend → *Definitieve reservering* + opties van die aanvraag worden bevestigd (ook in GHL). | uit |
| `option_expiry` | Vervaldatum per optie (`bookings.option_expires_at`, leeg = *N* dagen voor de datum). Waarschuwingstaak vóór de vervaldatum, daarna automatisch *Vervallen* + GHL-afspraak geannuleerd. | uit |
| `post_event` | Dag na een bevestigde reservering: contact → *Klant*, aanvraag → *Facturatie* (= opportunity **won** in GHL), GHL-tags (`klant`, `review-aanvraag`) voor workflows in GHL. | uit |
| `inbound_reply_sla` | Inkomend bericht langer dan *N* uur ongelezen → taak *Beantwoorden* (hoog). | uit |
| `contact_tags` | Contactstatus (lead/prospect/klant/inactief) als tag op het GHL-contact; oude statustag wordt verwijderd. | uit |

## Inschakelen zonder dubbele taken

De GHL-workflows maken nu nog taken aan. Per taaksoort:

1. Workflow in GoHighLevel uitzetten (of de taak-stap eruit halen).
2. **Instellingen → GHL-taken**: de soort uitzetten (nieuwe GHL-kopieën worden genegeerd).
3. **Instellingen → Automatiseringen**: het sjabloon aanzetten.

Bestaande toekomstige reserveringen krijgen bij de eerstvolgende run hun taken (met vervaldatum nooit in het verleden).

## Wat "won" betekent

Een opportunity is pas *won* in GoHighLevel als de reservering heeft plaatsgevonden: statussen *Facturatie*, *After sales*,
*Evenement* en *Condoleance herinnering* (`WON_STATUSES` in `_shared/ghlCommon.ts`). *Definitieve reservering* blijft *open*.

## Vereisten na deploy

- Migratie `20260929100000_crm_automations.sql` toepassen.
- Edge function `crm-automations` deployen (naast `ghl-sync`, `ghl-auto-sync`, `ghl-webhook`).
- Voor `quote_documents`: de GHL-workflow/webhook voor **Documents & Contracts** (sent / viewed / signed) moet naar `ghl-webhook` posten,
  óf de volledige sync (elke 30 min) haalt de documenten op via de Documents API.
- Voor `post_event`-tags: maak in GHL een workflow met trigger *Contact tag added* (`review-aanvraag`).
