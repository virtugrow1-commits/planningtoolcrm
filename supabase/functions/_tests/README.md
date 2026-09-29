# End-to-end tests (edge functions ↔ GoHighLevel)

Deze tests draaien de echte edge functions (`ghl-sync`, `ghl-auto-sync`, `ghl-webhook`,
`crm-automations`, `stage-offerte`) tegen een lokale Postgres + PostgREST en een
nagebootste GoHighLevel-API (`mock_server.ts`). Er wordt **niets** naar de echte GHL of
de live database gestuurd.

## Eenmalig

- PostgreSQL 16 lokaal, luisterend op poort `54329` met socket in `/tmp/pgtest`
- [PostgREST](https://github.com/PostgREST/postgrest/releases) binary
- [Deno](https://deno.land) 2.x

## Draaien

```bash
supabase/functions/_tests/localdb/rebuild.sh        # verse database: stubs + alle migraties + live-schema uit types.ts
POSTGREST_BIN=/pad/naar/postgrest supabase/functions/_tests/run_e2e.sh
```

De historische migraties zijn niet zelfstandig af te spelen (een deel van het schema is
buiten de migraties om aangemaakt), daarom vult `localdb/gen_from_types.py` de ontbrekende
tabellen en foreign keys aan vanuit `src/integrations/supabase/types.ts`. De nieuwe
migraties worden strikt (twee keer, voor idempotentie) toegepast.

Unit-tests van de pure logica: `deno test supabase/functions/_shared/automations.test.ts`.
