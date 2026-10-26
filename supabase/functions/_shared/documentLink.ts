// supabase/functions/_shared/documentLink.ts
//
// Welke aanvraag hoort bij een document uit CliqCRM?
//
// Regel: een document hoort alleen bij een aanvraag die al bestond toen het
// document werd gemaakt/verstuurd. Oude documenten van hetzelfde contact (van
// een eerdere aanvraag) worden nooit aan een nieuwe aanvraag gekoppeld en tellen
// dus nooit mee voor een nieuwe offerte (status, revisie, offertenummer,
// begroting, reserveringsbevestiging). Tonen in de documentenlijst mag wel.

const ts = (v?: string | null): number => {
  if (!v) return NaN;
  const n = Date.parse(String(v));
  return Number.isFinite(n) ? n : NaN;
};

/** Document is gemaakt/verstuurd vóórdat de aanvraag bestond. Onbekende datum = niet ervoor. */
export function isDocumentBeforeInquiry(docDate?: string | null, inquiryCreatedAt?: string | null): boolean {
  const d = ts(docDate);
  const i = ts(inquiryCreatedAt);
  if (!Number.isFinite(d) || !Number.isFinite(i)) return false;
  return d < i;
}

/**
 * Kies de aanvraag voor een (nog niet gekoppeld) document: de nieuwste aanvraag
 * van het contact die op of vóór de documentdatum is aangemaakt. Zonder
 * documentdatum wordt er niets gekoppeld.
 */
export function pickInquiryForDocument<T extends { id: string; created_at?: string | null }>(
  inquiries: T[], docDate?: string | null,
): T | null {
  const d = ts(docDate);
  if (!Number.isFinite(d)) return null;
  return [...(inquiries ?? [])]
    .filter((q) => {
      const c = ts(q.created_at);
      return Number.isFinite(c) && c <= d;
    })
    .sort((a, b) => ts(b.created_at) - ts(a.created_at))[0] ?? null;
}
