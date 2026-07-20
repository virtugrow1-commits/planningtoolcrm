## Probleem
De preview toont een React error #310 ("Rendered more hooks than during the previous render"). Dit betekent dat een component in de ene render meer hooks aanroept dan in de vorige — meestal veroorzaakt door een `if (...) return` **tussen** hooks, of een `useMemo`/`useState`/`useEffect` binnen een conditie.

De minified stack (`useMemo` → component `Mt` → `Hz` → …) wijst op een component met `useMemo` net vóór of ná een conditionele early-return. De verdachte is `src/pages/Dashboard.tsx` (route `/`), waar op regel 330 een `if (loading) return …` staat vóór verdere logica — maar op basis van een eerste scan zitten alle hooks daarvoor. Er is dus meer onderzoek nodig om zeker de juiste component te raken.

## Aanpak

1. **Diagnose scherp krijgen**
   - Bron-map de minified stack door via de dev-server (niet-geminified) dezelfde route te openen, zodat we exact zien welk bestand + regel de #310 gooit.
   - Check ook `NewQuotePage`, `QuoteDetailPage`, `PublicQuotePage`, `TemplateEditorPage` — daar zijn recent `useMemo`-blokken toegevoegd rond merge-tags/blocks.

2. **De hook-orde herstellen**
   - In het geïdentificeerde bestand alle `useState`/`useMemo`/`useEffect`/`useCallback` bovenaan de component plaatsen, vóór elke `if (...) return …`.
   - Conditionele hook-aanroepen omzetten naar hooks die *altijd* draaien maar intern conditioneel werken (bv. `useMemo(() => cond ? … : fallback, [deps])`).

3. **Regressie voorkomen**
   - ESLint-regel `react-hooks/rules-of-hooks` en `react-hooks/exhaustive-deps` verifiëren dat ze aan staan; eventuele bestaande waarschuwingen die eerder werden genegeerd oplossen.

4. **Verifiëren**
   - Preview opnieuw laden op `/` en op de recent gewijzigde offerte-pagina's.
   - Bevestigen dat er geen "App Error" meer verschijnt en de UI normaal rendert.

## Technische details

- React error #310 = *Rendered more hooks than during the previous render.* Ontstaat wanneer het aantal Hook-aanroepen per render verandert. Bijna altijd door: `if (loading) return null;` gevolgd door meer hooks, of een hook binnen `if`/`&&`/ternary.
- Fix-patroon:
  ```tsx
  // fout
  const a = useX();
  if (loading) return <Spinner/>;
  const b = useY(); // hook aantal wisselt
  
  // goed
  const a = useX();
  const b = useY();
  if (loading) return <Spinner/>;
  ```
- Voor Dashboard specifiek: als daar de bron ligt, betekent het waarschijnlijk dat de gebruiker onbedoeld tijdens laden→klaar een verandering triggerde in de sub-tree (bv. `KpiDetailDialog`, `SendQuoteDialog`, of een van de Providers).
