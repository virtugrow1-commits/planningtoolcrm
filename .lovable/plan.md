## Doel
Voorkomen dat taken die in het CRM zijn afgerond later opnieuw als openstaande taak terugkomen.

## Bevestigde diagnose
- De database laat zien dat op 3 augustus in korte synchronisatierondes tientallen oudere taken opnieuw zijn bijgewerkt; daarbij zijn zowel open als afgeronde statussen vanuit VirtuGrow verwerkt.
- De volledige synchronisatie haalt voor iedere gekoppelde contactpersoon alle externe taken op. Na slechts twee minuten krijgt de externe status weer voorrang en kan een lokaal afgeronde taak opnieuw op `open` worden gezet (`ghl-auto-sync`, taak-sync).
- Bij het versturen van een open taak wordt het verplichte veld `completed` momenteel weggelaten. De logs bevatten hierdoor een concrete 422-fout: `completed must be a boolean value`. Dit maakt de statusoverdracht en retries onbetrouwbaar.
- Er zijn geen dubbele lokale records met hetzelfde externe taak-ID gevonden. Het probleem zit dus primair in status-terugdraaiing, niet in dubbele weergave van hetzelfde record.

## Aanpak

### 1. Taakstatus altijd volledig en correct versturen
**`supabase/functions/ghl-sync/index.ts`**
- Bij iedere create en update expliciet `completed: true` of `completed: false` meesturen.
- Alleen een synchronisatie als geslaagd behandelen wanneer VirtuGrow de wijziging daadwerkelijk heeft geaccepteerd.
- De queue alleen afronden bij functionele success; foutpayloads met HTTP 200 blijven als fout/retry geregistreerd.

### 2. Afgeronde taken duurzaam beschermen
**Database-migratie voor `tasks`**
- Een expliciete lokale statusmarkering/tijdstempel toevoegen voor de laatste bewuste afronding of heropening door een gebruiker.
- Deze markering vullen wanneer een taak in het CRM wordt afgerond of bewust wordt heropend.
- Bestaande gegevens behouden; geen taken automatisch verwijderen.

**`src/contexts/TasksContext.tsx`**
- Bij afronden de lokale gebruikersbeslissing vastleggen samen met `completed_at`.
- Bij handmatig heropenen die bescherming bewust opheffen, zodat heropenen wel blijft werken.

### 3. Inkomende sync niet meer laten terugdraaien
**`supabase/functions/ghl-auto-sync/index.ts` en de handmatige `sync-tasks` route**
- Een lokaal afgeronde taak niet terugzetten naar open door een verouderde externe status.
- De afgeronde status in dat geval opnieuw naar VirtuGrow sturen, zodat beide systemen herstellen naar dezelfde toestand.
- Een taak alleen heropenen via een expliciete gebruikersactie in het CRM, niet door een periodieke pull.
- Dezelfde conflictregel in beide taak-syncpaden toepassen om verschillend gedrag tussen handmatige en automatische sync te voorkomen.

### 4. Terugkerende taken en retries opruimen
- Openstaande queue-items voor inmiddels afgeronde of verwijderde taken niet opnieuw als create uitvoeren.
- Oude foutieve retries met ontbrekende `completed`-waarde veilig opnieuw opbouwen vanuit de actuele taakstatus.
- Logging toevoegen voor `status beschermd`, `status doorgestuurd` en echte syncfouten, zodat een volgende terugkeer direct te herleiden is.

## Validatie
- Een open taak afronden, een volledige synchronisatie uitvoeren en controleren dat de taak afgerond blijft in beide systemen.
- Dezelfde synchronisatie meerdere keren uitvoeren om te bevestigen dat de taak niet terugkomt.
- Een taak bewust heropenen en controleren dat dit wel naar beide systemen doorloopt.
- Create/update testen voor zowel open als afgeronde taken en bevestigen dat de 422-fout niet meer optreedt.
- Een mislukte retry en een verwijderde taak testen, zodat de queue geen oude taak opnieuw aanmaakt.
