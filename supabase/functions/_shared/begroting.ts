// Begroting van de geaccepteerde offerte → reserveringsbevestiging.
//
// De GHL Documents-API geeft geen productregels terug. Bij het ondertekenen van
// een offerte maakt GHL wél automatisch een (concept)factuur aan met precies de
// geaccepteerde regels: "<titel offerte> - Invoice". Die factuur lezen we uit.

export interface InvoiceItem {
  name?: string;
  description?: string;
  qty?: number | string;
  amount?: number | string; // prijs per stuk, excl. btw
  taxes?: { name?: string; rate?: number | string; calculation?: string }[];
}

export interface Invoice {
  _id?: string;
  name?: string;
  status?: string;
  total?: number | string;
  invoiceTotal?: number | string;
  createdAt?: string;
  updatedAt?: string;
  contactDetails?: { id?: string };
  discount?: { value?: number | string; type?: string };
  items?: InvoiceItem[];
  /** Zo heten de regels in de GHL Invoices-API */
  invoiceItems?: InvoiceItem[];
  amountDue?: number | string;
}

/** Productregels van een factuur, ongeacht de veldnaam die GHL gebruikt. */
export function invoiceLines(inv: Invoice | null | undefined): InvoiceItem[] {
  if (!inv) return [];
  const list = (inv as any).invoiceItems ?? inv.items ?? (inv as any).lineItems ?? [];
  return Array.isArray(list) ? list : [];
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

/** 1703.45 -> "€ 1.703,45" */
export function euro(n: number): string {
  return '€ ' + new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(round2(n));
}

const stripHtml = (s?: string | null) => String(s ?? '')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/(p|div|li)>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/_/g, ' ')
  .split('\n').map((l) => l.replace(/\s{2,}/g, ' ').trim()).filter(Boolean).join('; ');

/**
 * Korte productnaam voor één regel in de bevestiging:
 * "Donge Borrelarrangement conform beschrijving, exclusief dranken" → "Donge Borrelarrangement"
 */
export function korteNaam(naam: string, max = 26): string {
  const kort = String(naam || '')
    .replace(/_/g, ' ')
    .split(/\s+(?:conform|inclusief|exclusief|incl\.?|excl\.?)\b|[,;:(]|\s[-–—]\s/i)[0]
    .replace(/\s{2,}/g, ' ')
    .trim();
  return kort.length > max ? kort.slice(0, max - 1).trimEnd() + '…' : kort;
}

/**
 * Kies de factuur die bij de getekende offerte hoort:
 * 1. naam = "<titel> - Invoice", 2. naam begint met de titel,
 * 3. anders de factuur van dit contact met hetzelfde totaalbedrag.
 */
export function pickInvoice(invoices: Invoice[], docTitle: string | null | undefined, docAmount: number | null | undefined): Invoice | null {
  const usable = (invoices ?? []).filter((i) => !['void', 'deleted'].includes(String(i.status || '').toLowerCase()));
  const title = String(docTitle || '').trim().toLowerCase();
  if (title) {
    const exact = usable.find((i) => String(i.name || '').trim().toLowerCase() === `${title} - invoice`);
    if (exact) return exact;
    const prefix = usable.find((i) => String(i.name || '').trim().toLowerCase().startsWith(title));
    if (prefix) return prefix;
  }
  if (docAmount && docAmount > 0) {
    const byAmount = usable
      .filter((i) => Math.abs(num(i.total ?? i.invoiceTotal) - docAmount) < 0.01)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    if (byAmount[0]) return byAmount[0];
  }
  return null;
}

export interface Begroting {
  regels: string;          // één regel per product, gescheiden door een nieuwe regel
  subtotaal: string;       // excl. btw
  btw: string;             // totaal btw, met verdeling per tarief
  totaal: string;          // incl. btw
  bron: 'factuur' | 'document_totaal' | 'geen';
  itemNamen: string[];
}

export function buildBegroting(invoice: Invoice | null, docAmount?: number | null): Begroting {
  const items = invoiceLines(invoice);
  if (!invoice || items.length === 0) {
    const fallback = docAmount && docAmount > 0 ? docAmount : num(invoice?.total ?? invoice?.invoiceTotal);
    const t = fallback > 0 ? euro(fallback) : '—';
    return { regels: '—', subtotaal: '—', btw: '—', totaal: t, bron: fallback > 0 ? 'document_totaal' : 'geen', itemNamen: [] };
  }

  const lines: string[] = [];
  const perRate = new Map<number, number>();
  let subtotaal = 0;
  for (const it of items) {
    const qty = num(it.qty) || 1;
    const prijs = num(it.amount);
    const regel = round2(qty * prijs);
    subtotaal += regel;
    for (const t of it.taxes ?? []) {
      const rate = num(t.rate);
      if (!rate) continue;
      const inclusive = String(t.calculation || '').toLowerCase() === 'inclusive';
      const tax = inclusive ? regel - regel / (1 + rate / 100) : regel * rate / 100;
      perRate.set(rate, (perRate.get(rate) ?? 0) + tax);
    }
    const naam = stripHtml(it.name) || 'Product';
    const omschrijving = stripHtml(it.description);
    lines.push(`${qty} × ${naam} à ${euro(prijs)} = ${euro(regel)}${omschrijving ? ` (${omschrijving})` : ''}`);
  }

  // Korting op de hele factuur
  let korting = 0;
  if (invoice.discount && num(invoice.discount.value) > 0) {
    korting = String(invoice.discount.type || '').toLowerCase() === 'percentage'
      ? subtotaal * num(invoice.discount.value) / 100
      : num(invoice.discount.value);
    lines.push(`Korting: -${euro(korting)}`);
  }

  const btwTotaal = [...perRate.values()].reduce((a, b) => a + b, 0) * (subtotaal > 0 ? (subtotaal - korting) / subtotaal : 1);
  const berekendTotaal = subtotaal - korting + btwTotaal;
  const factuurTotaal = num(invoice.total ?? invoice.invoiceTotal);
  const totaal = factuurTotaal > 0 ? factuurTotaal : berekendTotaal;
  const verdeling = [...perRate.entries()].sort((a, b) => a[0] - b[0])
    .map(([rate, bedrag]) => `${rate}%: ${euro(bedrag)}`).join(', ');

  return {
    regels: lines.join('\n'),
    subtotaal: euro(subtotaal - korting),
    btw: btwTotaal > 0 ? `${euro(btwTotaal)}${perRate.size > 1 ? ` (${verdeling})` : ''}` : euro(0),
    totaal: euro(totaal),
    bron: 'factuur',
    itemNamen: items.map((i) => stripHtml(i.name)).filter(Boolean),
  };
}

/** "Ja – <product>" als een geaccepteerd product erop wijst, anders "Nee". */
export function onderdeel(itemNamen: string[], patroon: RegExp, bron: Begroting['bron']): string {
  if (bron !== 'factuur') return '—';
  const hit = itemNamen.find((n) => patroon.test(n));
  // Kort houden: de waarde moet op één regel naast het label passen
  return hit ? `Ja – ${korteNaam(hit)}` : 'Nee';
}

export const ONDERDELEN = {
  lunch: /lunch/i,
  borrel: /(borrel|hapjes|bites|bittergarnituur)/i,
  diner: /(diner|kookworkshop|kookstudio|buffet|bbq|barbecue|proeverij)/i,
};

/** "13:00" → "12:45" (inloop standaard een kwartier voor aanvang) */
export function inloopVoor(start: string, minuten = 15): string {
  const m = start.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return '—';
  let t = Number(m[1]) * 60 + Number(m[2]) - minuten;
  if (t < 0) t += 24 * 60;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}
