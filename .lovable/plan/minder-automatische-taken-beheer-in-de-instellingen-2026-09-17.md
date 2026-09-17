# Minder automatische taken + beheer in de instellingen

## Wat er nu gebeurt

De automatische taken worden niet in CliqCRM bedacht, maar komen uit GoHighLevel. CliqCRM haalt ze elke 5 minuten op en zet ze allemaal 1-op-1 in de takenlijst. Twee dingen zorgen voor de vloed:

1. GoHighLevel maakt dezelfde taak meerdere keren aan. Voorbeeld uit de database: "Detailgesprek inplannen - Martin En Elly Van Nieuwenhoven" staat 32x, allemaal met dezelfde datum (18-09) en dezelfde persoon, maar met 32 verschillende taken uit GoHighLevel. Ook "Factuur sturen - ..." en "Def. aantal gasten + dieetwensen - ..." staan meerdere keren per persoon.
2. Er is geen enkele filter: elke taaksoort die GoHighLevel stuurt komt binnen, of je die soort wilt gebruiken of niet.

## Wat we gaan doen

1. **Dubbele taken samenvoegen bij binnenhalen.** Komt er een taak binnen die voor dezelfde persoon, met dezelfde titel en dezelfde datum al bestaat, dan wordt die niet opnieuw aangemaakt. De bestaande taak blijft de enige. CliqCRM houdt bij welke kopieën genegeerd zijn, zodat ze bij een volgende synchronisatie niet terugkomen.
2. **Bestaande dubbelen opruimen.** Eenmalig: per set van identieke taken (zelfde persoon, titel en datum) blijft er één staan, de rest verdwijnt. Is er in een set één taak al afgerond of aangepast, dan blijft die bewaard.
3. **Nieuwe instelling "Automatische taken".** In Instellingen komt een tabblad met een lijst van alle automatische taaksoorten (bijv. "Detailgesprek inplannen", "Factuur sturen", "Offerte nabellen", "Koud bellen"). Per soort een schuifje aan/uit en een leesbare naam die je kunt aanpassen. De lijst wordt gevuld met de soorten die nu voorkomen en groeit automatisch aan als GoHighLevel een nieuwe soort stuurt (nieuwe soorten staan standaard aan).
4. **Uitgezette soorten komen niet meer binnen.** Zet je een soort uit, dan worden er geen nieuwe taken van die soort meer aangemaakt. Taken die er al staan blijven staan — die verwijderen we niet.
5. **Zichtbaar wat er gebeurt.** Per soort tonen we hoeveel taken er nu open staan, en in het overzicht hoeveel kopieën bij de laatste synchronisatie zijn genegeerd.

## Technische details

- Nieuwe tabel `task_automation_rules`: `id`, `user_id`, `match_key` (genormaliseerde titel zonder persoonsnaam-suffix), `label`, `enabled` (default true), timestamps + update-trigger, RLS per gebruiker, GRANTs voor `authenticated` en `service_role`.
- Nieuwe tabel `ghl_task_suppressions`: `ghl_task_id` (unique), `reason` (`duplicate` / `rule_disabled`), `kept_task_id`, `created_at`. Voorkomt heraanmaak bij elke sync en voorkomt dat de orphan-cleanup ze verwisselt.
- Helper `taskRuleKey(title)` in `supabase/functions/_shared/`: trimt, lowercased, strip trailing ` - <naam>` en overtollige spaties → match_key.
- `supabase/functions/ghl-auto-sync/index.ts` (taken-blok rond regel 1650-1690) en de `sync-tasks`-actie in `ghl-sync/index.ts`:
  - vóór insert: `ghl_task_suppressions` check → skip; regel opzoeken op `match_key`, ontbreekt die dan aanmaken met `enabled = true`; `enabled = false` → skip + suppression `rule_disabled`.
  - duplicaatcheck op `(contact_id, match_key, due_date)` tegen al ingeladen taken → skip + suppression `duplicate` met `kept_task_id`.
  - orphan-cleanup: taken met een `ghl_task_id` in `ghl_task_suppressions` overslaan; bestaande beschermingen (`local_status_changed_at`, 24u-venster) blijven ongewijzigd.
  - resultaat uitbreiden met `tasks_suppressed`.
- Eenmalige opruiming via run_sql: per `(contact_id, match_key, due_date)` de te bewaren taak kiezen (voorkeur: afgerond of lokaal gewijzigd, anders oudste), overige verwijderen en hun `ghl_task_id` in `ghl_task_suppressions` zetten.
- Nieuw tabblad in `src/pages/SettingsPage.tsx` met een component `src/components/settings/TaskAutomationPanel.tsx`: lijst met switch, inline te wijzigen label, aantal open taken per soort; realtime niet nodig, gewoon fetch + update.
- Geen wijziging aan de takenpagina zelf en geen wijziging in GoHighLevel.

## Buiten scope

We kunnen GoHighLevel niet stoppen met het aanmaken van taken; CliqCRM negeert ze voortaan. Als een workflow in GoHighLevel echt uit moet, moet dat daar gebeuren.
