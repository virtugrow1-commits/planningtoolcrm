// supabase/functions/_shared/bedrijfsnaam.ts
//
// Bedrijfsnaam op offerte en reserveringsbevestiging.
//   1. "Op naam van" (indien ingevuld)
//   2. de echte bedrijfsnaam
//   3. anders "Particulier" (particuliere klantkaart of geen bedrijf bekend)
// Placeholders als "Onbekend" tellen nooit als bedrijfsnaam.

const PLACEHOLDERS = new Set(['', '—', '-', 'onbekend', 'unknown', 'n.v.t.', 'nvt', 'particulier']);

export function isPlaceholderName(v?: string | null): boolean {
  return PLACEHOLDERS.has(String(v ?? '').trim().toLowerCase());
}

export function resolveBedrijfsnaam(input: {
  opNaamVan?: string | null;
  company?: { name?: string | null; is_private?: boolean | null } | null;
  contactCompany?: string | null;
  /** Contact hangt aan een particuliere klantkaart */
  contactIsPrivate?: boolean | null;
}): string {
  const opNaamVan = String(input.opNaamVan ?? '').trim();
  if (opNaamVan) return opNaamVan;

  const isPrivate = Boolean(input.company?.is_private || input.contactIsPrivate);
  if (!isPrivate) {
    const companyName = String(input.company?.name ?? '').trim();
    if (!isPlaceholderName(companyName)) return companyName;
    const contactCompany = String(input.contactCompany ?? '').trim();
    if (!isPlaceholderName(contactCompany)) return contactCompany;
  }
  return 'Particulier';
}
