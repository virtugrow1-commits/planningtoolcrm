// supabase/functions/_shared/phone.ts
//
// Telefoonnummer uit een formulier op het contact zetten, alleen als het
// contact nog geen nummer heeft. Bestaande nummers worden nooit overschreven.

import { GHL_API_BASE } from './ghlCommon.ts';

/** "06 12444829" -> "+31612444829"; ongeldig/leeg -> null */
export function normalizePhone(raw?: string | null): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  let digits = s.replace(/[^\d+]/g, '');
  if (digits.startsWith('00')) digits = '+' + digits.slice(2);
  if (/^0\d{9}$/.test(digits)) digits = '+31' + digits.slice(1);
  const count = digits.replace(/\D/g, '').length;
  if (count < 8 || count > 15) return null;
  return digits;
}

/** Is er een bruikbaar nummer? (lege waarde, "—" of "ontbreekt" telt niet) */
export function hasPhone(v?: string | null): boolean {
  const s = String(v ?? '').trim().toLowerCase();
  return s !== '' && s !== '—' && s !== '-' && s !== 'ontbreekt';
}

/**
 * Vul het telefoonnummer van een BUUT-contact (en het GHL-contact) aan vanuit
 * het formulier. Doet niets als het nummer onbekend is of al bekend was.
 */
export async function fillContactPhone(
  supabase: any,
  contactId: string | null | undefined,
  formPhone: string | null | undefined,
  /** ghlPhone: huidig nummer in GHL; undefined = onbekend (dan GHL niet aanpassen) */
  ghl?: { headers: Record<string, string>; ghlContactId?: string | null; ghlPhone?: string | null },
): Promise<string | null> {
  const phone = normalizePhone(formPhone);
  if (!phone) return null;

  if (contactId) {
    const { data: row } = await supabase.from('contacts').select('phone, mobile').eq('id', contactId).maybeSingle();
    if (row && !hasPhone(row.phone) && !hasPhone(row.mobile)) {
      const { error } = await supabase.from('contacts').update({ phone }).eq('id', contactId);
      if (error) console.warn('[phone] contact update failed:', error.message);
    }
  }

  if (ghl?.ghlContactId && ghl.ghlPhone !== undefined && !hasPhone(ghl.ghlPhone)) {
    try {
      const r = await fetch(`${GHL_API_BASE}/contacts/${ghl.ghlContactId}`, {
        method: 'PUT',
        headers: ghl.headers,
        body: JSON.stringify({ phone }),
      });
      if (!r.ok) console.warn(`[phone] GHL update failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
      else await r.text();
    } catch (e) {
      console.warn('[phone] GHL update failed:', e);
    }
  }
  return phone;
}
