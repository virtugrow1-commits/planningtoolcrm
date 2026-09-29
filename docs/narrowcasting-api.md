# CliqCRM lees-API — handleiding voor narrowcasting / Casting tool

De narrowcasting (en de Casting tool) haalt gegevens op via een beveiligde
weblink (REST API). Directe database-toegang is **niet** nodig.

## Basis

- **Endpoint:** `https://homqvnnphotphxemurwp.supabase.co/functions/v1/crm-read-api`
- **Methode:** `GET`
- **Authenticatie:** header `x-api-key: <geheime sleutel>`
- **Antwoord:** JSON

## Resources

| resource    | inhoud                                              |
|-------------|-----------------------------------------------------|
| `rooms`     | actieve zalen (naam, capaciteit)                    |
| `companies` | bedrijven en particuliere klanten                   |
| `contacts`  | contactpersonen                                     |
| `inquiries` | aanvragen                                           |
| `bookings`  | reserveringen (eventnaam, zaal, datum, tijden)      |

## Parameters

| parameter    | werking                                                          |
|--------------|------------------------------------------------------------------|
| `resource`   | verplicht, één van de resources hierboven                        |
| `q`          | vrije zoekterm (naam, e-mail, eventtitel, zaal)                  |
| `from` / `to`| datumbereik `yyyy-MM-dd` (alleen bij `bookings`)                 |
| `day=today`  | alleen reserveringen van vandaag (Amsterdam-tijd) — handig voor narrowcasting |
| `company_id` | filter op één klant                                              |
| `id`         | één specifiek record ophalen                                     |
| `limit`      | max. aantal rijen (standaard 200, max 500)                       |
| `offset`     | voor paginering                                                  |

## Voorbeelden

Reserveringen van vandaag (typisch narrowcasting-scherm):

```bash
curl "https://homqvnnphotphxemurwp.supabase.co/functions/v1/crm-read-api?resource=bookings&day=today" \
  -H "x-api-key: <geheime sleutel>"
```

Reserveringen van een week:

```bash
curl "https://homqvnnphotphxemurwp.supabase.co/functions/v1/crm-read-api?resource=bookings&from=2026-09-29&to=2026-10-05" \
  -H "x-api-key: <geheime sleutel>"
```

## Antwoordformaat

```json
{
  "resource": "bookings",
  "count": 3,
  "offset": 0,
  "limit": 200,
  "data": [ { "id": "...", "title": "...", "room_name": "...", "date": "2026-09-29", "start_hour": 18, "start_minute": 0, "end_hour": 23, "end_minute": 0, "status": "confirmed", "guest_count": 80, "contact_name": "...", "company_id": "..." } ]
}
```

## Foutcodes

- `401 Unauthorized` — sleutel ontbreekt of klopt niet
- `400` — onbekende resource of ongeldige parameter
- `405` — alleen `GET` is toegestaan

## Let op

- De sleutel nooit in een publiek scherm of broncode zetten; de narrowcasting
  moet de sleutel server-side of in een beveiligde player-config meesturen.
- De API is alleen-lezen; schrijven kan niet.
