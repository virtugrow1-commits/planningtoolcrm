// Generate the PDF that clients receive.
// Priority:
//   1) If the quote (or its template) has content_blocks with absolute (x,y,page)
//      positions, render every block onto the corresponding page of the template PDF
//      (matches what the customer sees in the online portal).
//   2) Legacy overlay_fields are still rendered on top of the template PDF.
//   3) If neither is present, fall back to a clean branded PDF from scratch.
//
// All merge tags are re-resolved server-side against a fresh map built from the
// linked CRM contact + company so the values are always up-to-date.

import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import { PDFDocument, StandardFonts, rgb, PDFFont } from 'npm:pdf-lib@1.17.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const BRAND_BROWN = rgb(0.62, 0.32, 0.23);
const BRAND_GOLD = rgb(0.89, 0.73, 0.48);
const TEXT = rgb(0.15, 0.15, 0.15);
const MUTED = rgb(0.45, 0.45, 0.45);

function fmtEUR(n: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n || 0);
}
function fmtDate(s?: string | null) {
  if (!s) return '';
  try {
    return new Date(s).toLocaleDateString('nl-NL', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch { return String(s); }
}
function fmtDateShort(s?: string | null) {
  if (!s) return '';
  try {
    const d = new Date(s);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}-${mm}-${d.getFullYear()}`;
  } catch { return String(s); }
}

/* ─── Merge tags ─────────────────────────────────────────────── */

function buildMergeMap(quote: any, contact: any, company: any): Record<string, string> {
  const total = Number(quote.total || 0);
  const sub = Number(quote.subtotal || 0);
  const vat = Number(quote.vat_amount || 0);
  const c = contact || {};
  const co = company || {};

  const contactFull =
    quote.contact_name ||
    [c.first_name, c.last_name].filter(Boolean).join(' ') ||
    '';
  const address = quote.client_address ||
    [co.address, co.postcode, co.city].filter(Boolean).join(', ') || '';

  const map: Record<string, string> = {
    // contact
    '{{contact.name}}': contactFull,
    '{{contact.first_name}}': c.first_name || contactFull.split(' ')[0] || '',
    '{{contact.last_name}}': c.last_name || contactFull.split(' ').slice(1).join(' ') || '',
    '{{contact.email}}': quote.client_email || c.email || '',
    '{{contact.phone}}': c.phone || '',
    '{{contact.job_title}}': c.job_title || '',
    '{{contact.department}}': c.department || '',
    // company
    '{{company.name}}': quote.company_name || co.name || '',
    '{{company.email}}': co.email || '',
    '{{company.phone}}': co.phone || '',
    '{{company.address}}': co.address || '',
    '{{company.postcode}}': co.postcode || '',
    '{{company.city}}': co.city || '',
    '{{company.country}}': co.country || '',
    '{{company.kvk}}': co.kvk || '',
    '{{company.btw_number}}': co.btw_number || '',
    '{{company.website}}': co.website || '',
    // quote
    '{{quote.display_number}}': quote.display_number || '',
    '{{quote.title}}': quote.title || '',
    '{{quote.subtotal}}': fmtEUR(sub),
    '{{quote.vat_amount}}': fmtEUR(vat),
    '{{quote.total}}': fmtEUR(total),
    '{{quote.valid_until}}': fmtDate(quote.valid_until),
    // date
    '{{date.today}}': fmtDateShort(new Date().toISOString()),
    '{{date.today_long}}': fmtDate(new Date().toISOString()),
    // legacy
    '{{client_name}}': contactFull,
    '{{company_name}}': quote.company_name || co.name || '',
    '{{client_email}}': quote.client_email || c.email || '',
    '{{client_address}}': address,
    '{{quote_number}}': quote.display_number || '',
    '{{date}}': fmtDateShort(new Date().toISOString()),
    '{{valid_until}}': fmtDate(quote.valid_until),
    '{{subtotal}}': fmtEUR(sub),
    '{{vat_amount}}': fmtEUR(vat),
    '{{total}}': fmtEUR(total),
  };
  return map;
}

function applyAliases(text: string, map: Record<string, string>): string {
  if (!text) return text;
  const g = (k: string) => map[k] || '';
  const aliases: Array<[RegExp, string]> = [
    [/(?:<|&lt;)\s*voornaam\s*(?:>|&gt;)/gi, g('{{contact.first_name}}')],
    [/(?:<|&lt;)\s*achternaam\s*(?:>|&gt;)/gi, g('{{contact.last_name}}')],
    [/(?:<|&lt;)\s*naam(?:\s+klant)?\s*(?:>|&gt;)/gi, g('{{contact.name}}')],
    [/(?:<|&lt;)\s*(?:email|e-?mailadres)\s*(?:>|&gt;)/gi, g('{{contact.email}}')],
    [/(?:<|&lt;)\s*telefoon(?:nummer)?\s*(?:>|&gt;)/gi, g('{{contact.phone}}')],
    [/(?:<|&lt;)\s*(?:bedrijf|bedrijfsnaam|organisatie)\s*(?:>|&gt;)/gi, g('{{company.name}}')],
    [/(?:<|&lt;)\s*adres\s*(?:>|&gt;)/gi, g('{{company.address}}') || g('{{client_address}}')],
    [/(?:<|&lt;)\s*postcode\s*(?:>|&gt;)/gi, g('{{company.postcode}}')],
    [/(?:<|&lt;)\s*(?:plaats|stad|woonplaats)\s*(?:>|&gt;)/gi, g('{{company.city}}')],
    [/(?:<|&lt;)\s*datum\s*(?:>|&gt;)/gi, g('{{date.today_long}}')],
    [/(?:<|&lt;)\s*offertenummer\s*(?:>|&gt;)/gi, g('{{quote.display_number}}')],
    [/(?:<|&lt;)\s*kostenplaats\s*(?:>|&gt;)/gi, g('{{company.name}}')],
    [/\{\s*naam\s+klant\s*\}/gi, g('{{contact.name}}')],
    [/\{\s*klantnaam\s*\}/gi, g('{{contact.name}}')],
    [/\{\s*klant\s*\}/gi, g('{{contact.name}}')],
    [/\{\s*bedrijf(?:snaam)?\s*\}/gi, g('{{company.name}}')],
  ];
  let out = text;
  for (const [re, val] of aliases) out = out.replace(re, val);
  return out;
}

function expandLabelLines(text: string, map: Record<string, string>): string {
  if (!text) return text;
  const labelValues: Array<[RegExp, string]> = [
    [/^(\s*)Naam\s*:?\s*$/i, map['{{contact.name}}'] || ''],
    [/^(\s*)Voornaam\s*:?\s*$/i, map['{{contact.first_name}}'] || ''],
    [/^(\s*)Achternaam\s*:?\s*$/i, map['{{contact.last_name}}'] || ''],
    [/^(\s*)Adres\s*:?\s*$/i, map['{{company.address}}'] || map['{{client_address}}'] || ''],
    [/^(\s*)Postcode(?:\s+en\s+Plaats)?\s*:?\s*$/i,
      [map['{{company.postcode}}'], map['{{company.city}}']].filter(Boolean).join(' ')],
    [/^(\s*)Plaats\s*:?\s*$/i, map['{{company.city}}'] || ''],
    [/^(\s*)E-?mail(?:adres)?(?:\s*\([^)]*\))?\s*:?\s*$/i, map['{{contact.email}}'] || ''],
    [/^(\s*)Telefoon(?:nummer)?\s*:?\s*$/i, map['{{contact.phone}}'] || ''],
    [/^(\s*)Bedrijf(?:snaam)?\s*:?\s*$/i, map['{{company.name}}'] || ''],
    [/^(\s*)Kostenplaats\s*:?\s*$/i, map['{{company.name}}'] || ''],
    [/^(\s*)Reserveringsnummer\s*:?\s*$/i, map['{{quote.display_number}}'] || ''],
    [/^(\s*)Datum(?:\s+en\s+tijd)?\s*:?\s*$/i, map['{{date.today_long}}'] || ''],
  ];
  return text.split('\n').map((line) => {
    for (const [re, val] of labelValues) {
      if (re.test(line) && val) {
        const label = line.replace(/\s*:?\s*$/, '').trim();
        return `${label}: ${val}`;
      }
    }
    return line;
  }).join('\n');
}

function resolveMergeTags(text: string, map: Record<string, string>): string {
  if (!text) return '';
  let out = applyAliases(text, map);
  for (const [tag, value] of Object.entries(map)) {
    const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(escaped, 'g'), value);
  }
  out = expandLabelLines(out, map);
  return out;
}

/* ─── HTML → plain lines with basic list support ─────────────── */

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&euro;/g, '€');
}

/**
 * Turn simple HTML from the block editor into paragraph lines.
 * Supports: <p>, <br>, <ul><li>, <ol><li>, <div>. Strips other tags.
 */
function htmlToParagraphs(html: string): string[] {
  if (!html) return [];
  let s = html.replace(/\r/g, '');

  // Ordered lists: number each <li>
  s = s.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_m, inner: string) => {
    let n = 0;
    return inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_x, item: string) => {
      n += 1;
      return `\n${n}. ${item}\n`;
    });
  });
  // Unordered lists: bullet each <li>
  s = s.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_m, inner: string) => {
    return inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_x, item: string) => {
      return `\n• ${item}\n`;
    });
  });

  s = s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6])\s*>/gi, '\n')
    .replace(/<(p|div|h[1-6])[^>]*>/gi, '')
    .replace(/<[^>]+>/g, ''); // strip remaining tags

  s = decodeEntities(s);
  // Collapse >2 blank lines
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.split('\n').map((l) => l.replace(/\s+$/g, ''));
}

/** Wrap a single line to a max pixel width using the given font/size. */
function wrapLine(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (!text) return [''];
  const words = text.split(' ');
  const out: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    let width = 0;
    try { width = font.widthOfTextAtSize(test, size); } catch { width = test.length * size * 0.5; }
    if (width > maxWidth && line) {
      out.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) out.push(line);
  return out.length ? out : [''];
}

function hexToRgb(hex: string) {
  if (!hex) return TEXT;
  const h = hex.replace('#', '');
  if (h.length !== 6) return TEXT;
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  return rgb(isNaN(r) ? 0 : r, isNaN(g) ? 0 : g, isNaN(b) ? 0 : b);
}

/** Sanitize text for pdf-lib's WinAnsi encoding: replace unsupported glyphs. */
function sanitize(s: string): string {
  return s
    // curly quotes → straight
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    // dashes
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    // non-breaking space
    .replace(/\u00A0/g, ' ')
    // strip any remaining char outside Latin-1 that WinAnsi can't encode
    .replace(/[^\x00-\xFF€•]/g, '?');
}

/* ─── Block renderer ─────────────────────────────────────────── */

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
}

interface RenderCtx {
  pdf: PDFDocument;
  fonts: Fonts;
  map: Record<string, string>;
  items: any[];
  quote: any;
}

function pickFont(fonts: Fonts, weight?: string, style?: string): PDFFont {
  const bold = weight === 'bold';
  const italic = style === 'italic';
  if (bold && italic) return fonts.boldItalic;
  if (bold) return fonts.bold;
  if (italic) return fonts.italic;
  return fonts.regular;
}

function ensurePage(pdf: PDFDocument, idx: number) {
  while (pdf.getPageCount() <= idx) pdf.addPage([595, 842]);
  return pdf.getPage(idx);
}

async function renderBlock(block: any, ctx: RenderCtx) {
  const pageIdx = Math.max(0, Number(block.pageIndex || 0));
  const page = ensurePage(ctx.pdf, pageIdx);
  const { height: ph } = page.getSize();

  const x = Number(block.x ?? 40) || 40;
  const yTop = Number(block.y ?? 40) || 40;
  const w = Number(block.w ?? 515) || 515;
  const h = Number(block.h ?? 100) || 100;

  switch (block.type) {
    case 'text': {
      const fontSize = Number(block.fontSize || 12);
      const lineHeight = Number(block.lineHeight || 1.4);
      const color = hexToRgb(block.color || '#000000');
      const font = pickFont(ctx.fonts, block.fontWeight, block.fontStyle);
      const align = block.textAlign || 'left';

      const rawHtml = resolveMergeTags(String(block.content || ''), ctx.map);
      const paragraphs = htmlToParagraphs(rawHtml);
      let cursorY = ph - yTop - fontSize;
      const bottomLimit = ph - yTop - h;

      for (const para of paragraphs) {
        const text = sanitize(para);
        const wrapped = wrapLine(text, font, fontSize, w);
        for (const line of wrapped) {
          if (cursorY < bottomLimit - fontSize) break; // clip to block box
          if (cursorY < 20) break; // clip to page
          let drawX = x;
          if (align === 'center' || align === 'right') {
            let width = 0;
            try { width = font.widthOfTextAtSize(line, fontSize); } catch { /* ignore */ }
            if (align === 'center') drawX = x + (w - width) / 2;
            if (align === 'right') drawX = x + (w - width);
          }
          page.drawText(line, { x: drawX, y: cursorY, size: fontSize, font, color });
          cursorY -= fontSize * lineHeight;
        }
      }
      break;
    }

    case 'details': {
      const font = ctx.fonts.regular;
      const boldFont = ctx.fonts.bold;
      const size = 11;
      const lh = size * 1.5;
      let cursorY = ph - yTop - size;
      for (const f of block.fields || []) {
        if (cursorY < ph - yTop - h) break;
        const label = sanitize(String(f.label || ''));
        const value = sanitize(resolveMergeTags(String(f.mergeTag || ''), ctx.map));
        page.drawText(`${label}:`, { x, y: cursorY, size, font: boldFont, color: TEXT });
        const labelW = boldFont.widthOfTextAtSize(`${label}: `, size);
        page.drawText(value, { x: x + labelW, y: cursorY, size, font, color: TEXT });
        cursorY -= lh;
      }
      break;
    }

    case 'text-field':
    case 'date-field': {
      const font = ctx.fonts.regular;
      const boldFont = ctx.fonts.bold;
      const size = 11;
      const label = sanitize(String(block.label || ''));
      const value = sanitize(resolveMergeTags(String(block.mergeTag || ''), ctx.map));
      const y = ph - yTop - size;
      page.drawText(`${label}:`, { x, y, size, font: boldFont, color: TEXT });
      const lw = boldFont.widthOfTextAtSize(`${label}: `, size);
      page.drawText(value, { x: x + lw, y, size, font, color: TEXT });
      break;
    }

    case 'signature': {
      // Draw a placeholder line + label; actual signature is captured online
      const size = 10;
      const y = ph - yTop - h + 12;
      page.drawLine({
        start: { x, y: y + 4 },
        end: { x: x + Math.min(w, 220), y: y + 4 },
        color: MUTED, thickness: 0.5,
      });
      page.drawText(sanitize(String(block.label || 'Handtekening')), {
        x, y: y - 10, size, font: ctx.fonts.regular, color: MUTED,
      });
      break;
    }

    case 'image': {
      if (!block.src) break;
      try {
        const res = await fetch(block.src);
        if (!res.ok) break;
        const buf = new Uint8Array(await res.arrayBuffer());
        const isPng = /png(\?|$)/i.test(block.src) || (buf[0] === 0x89 && buf[1] === 0x50);
        const img = isPng ? await ctx.pdf.embedPng(buf) : await ctx.pdf.embedJpg(buf);
        const drawW = Math.min(w, img.width);
        const scale = drawW / img.width;
        const drawH = img.height * scale;
        page.drawImage(img, { x, y: ph - yTop - drawH, width: drawW, height: drawH });
      } catch (e) {
        console.warn('image block render failed', e);
      }
      break;
    }

    case 'table': {
      const font = ctx.fonts.regular;
      const boldFont = ctx.fonts.bold;
      const size = 9;
      const cols = block.columns || [];
      const rows = block.rows || [];
      if (!cols.length) break;
      const colW = w / cols.length;
      let cursorY = ph - yTop - size - 2;
      // header
      page.drawRectangle({ x, y: cursorY - 2, width: w, height: size + 6, color: BRAND_GOLD });
      cols.forEach((c: any, i: number) => {
        page.drawText(sanitize(String(c.header || '')), {
          x: x + i * colW + 4, y: cursorY, size, font: boldFont, color: TEXT,
        });
      });
      cursorY -= size + 8;
      for (const row of rows) {
        if (cursorY < ph - yTop - h) break;
        cols.forEach((c: any, i: number) => {
          const cell = sanitize(resolveMergeTags(String(row[c.id] || ''), ctx.map));
          const wrapped = wrapLine(cell, font, size, colW - 8);
          page.drawText(wrapped[0] || '', {
            x: x + i * colW + 4, y: cursorY, size, font, color: TEXT,
          });
        });
        cursorY -= size + 6;
      }
      break;
    }

    case 'product-list': {
      // Prefer the quote's real line items over the block's cached items.
      const source = ctx.items && ctx.items.length > 0
        ? ctx.items.map((li) => ({
            name: li.item_name, description: li.description,
            quantity: li.quantity, unitPrice: Number(li.unit_price),
            vatRate: li.vat_rate, lineTotal: Number(li.line_total),
          }))
        : (block.items || []).map((it: any) => ({
            name: it.name, description: it.description,
            quantity: it.quantity, unitPrice: Number(it.unitPrice),
            vatRate: it.vatRate, lineTotal: Number(it.quantity) * Number(it.unitPrice),
          }));
      drawProductTable(page, ctx.fonts, source, x, ph - yTop, w, h);
      break;
    }

    // Skipped in PDF: page-break, video, initials, checkbox
    default:
      break;
  }
}

function drawProductTable(
  page: any, fonts: Fonts, items: any[],
  x: number, yTop: number, w: number, h: number,
) {
  const size = 9;
  const font = fonts.regular;
  const boldFont = fonts.bold;
  const colDesc = w * 0.5;
  const colQty = w * 0.1;
  const colPrice = w * 0.15;
  const colVat = w * 0.1;
  const colTotal = w * 0.15;

  let cy = yTop - size - 2;
  page.drawRectangle({ x, y: cy - 2, width: w, height: size + 6, color: BRAND_GOLD });
  page.drawText('Omschrijving', { x: x + 4, y: cy, size, font: boldFont, color: TEXT });
  page.drawText('Aantal', { x: x + colDesc + 4, y: cy, size, font: boldFont, color: TEXT });
  page.drawText('Prijs', { x: x + colDesc + colQty + 4, y: cy, size, font: boldFont, color: TEXT });
  page.drawText('BTW', { x: x + colDesc + colQty + colPrice + 4, y: cy, size, font: boldFont, color: TEXT });
  page.drawText('Totaal', { x: x + colDesc + colQty + colPrice + colVat + 4, y: cy, size, font: boldFont, color: TEXT });
  cy -= size + 10;

  for (const it of items) {
    if (cy < yTop - h + 20) break;
    page.drawText(sanitize(String(it.name || '').slice(0, 60)), {
      x: x + 4, y: cy, size, font, color: TEXT,
    });
    page.drawText(String(it.quantity ?? ''), { x: x + colDesc + 4, y: cy, size, font, color: TEXT });
    page.drawText(fmtEUR(Number(it.unitPrice)), { x: x + colDesc + colQty + 4, y: cy, size, font, color: TEXT });
    page.drawText(`${it.vatRate ?? 21}%`, { x: x + colDesc + colQty + colPrice + 4, y: cy, size, font, color: TEXT });
    page.drawText(fmtEUR(Number(it.lineTotal)), { x: x + colDesc + colQty + colPrice + colVat + 4, y: cy, size, font, color: TEXT });
    cy -= size + 4;
    if (it.description) {
      const dl = wrapLine(sanitize(String(it.description)), font, size - 1, colDesc - 8);
      for (const l of dl.slice(0, 2)) {
        if (cy < yTop - h + 20) break;
        page.drawText(l, { x: x + 8, y: cy, size: size - 1, font, color: MUTED });
        cy -= size + 2;
      }
    }
  }
}

/* ─── Handler ────────────────────────────────────────────────── */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { quoteId } = await req.json();
    if (!quoteId) {
      return new Response(JSON.stringify({ error: 'quoteId is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: quote, error: qErr } = await supabase
      .from('quotes').select('*').eq('id', quoteId).single();
    if (qErr || !quote) {
      return new Response(JSON.stringify({ error: 'Quote not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch CRM linked contact + company for a rich merge map
    const [contactRes, companyRes] = await Promise.all([
      quote.contact_id
        ? supabase.from('contacts').select('*').eq('id', quote.contact_id).maybeSingle()
        : Promise.resolve({ data: null }),
      quote.company_id
        ? supabase.from('companies').select('*').eq('id', quote.company_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const contact: any = (contactRes as any).data;
    const company: any = (companyRes as any).data;

    const { data: items } = await supabase
      .from('quote_line_items').select('*').eq('quote_id', quoteId).order('sort_order');

    // Resolve template PDF + fallback content blocks from template if the quote itself has none.
    let templatePdfUrl: string | null = quote.pdf_url || null;
    let overlayFields: any[] = Array.isArray(quote.overlay_fields) ? quote.overlay_fields : [];
    let contentBlocks: any[] = Array.isArray(quote.content_blocks) ? quote.content_blocks : [];

    if ((!templatePdfUrl || contentBlocks.length === 0) && quote.template_id) {
      const { data: tpl } = await supabase
        .from('quote_templates').select('content_blocks').eq('id', quote.template_id).single();
      const cb = tpl?.content_blocks as any;
      if (!templatePdfUrl) {
        templatePdfUrl = cb?.pdfUrl || cb?.pdfBackgroundUrl || cb?.editorPdfUrl || null;
      }
      if (overlayFields.length === 0 && Array.isArray(cb?.overlayFields)) {
        overlayFields = cb.overlayFields;
      }
      if (contentBlocks.length === 0 && Array.isArray(cb?.blocks)) {
        contentBlocks = cb.blocks;
      }
    }

    let pdf: PDFDocument;
    let usedTemplate = false;

    if (templatePdfUrl) {
      try {
        const res = await fetch(templatePdfUrl);
        if (!res.ok) throw new Error(`Fetch template PDF failed (${res.status})`);
        const buf = await res.arrayBuffer();
        pdf = await PDFDocument.load(buf);
        usedTemplate = true;
      } catch (e) {
        console.warn('Could not load template PDF, falling back to generated PDF', e);
        pdf = await PDFDocument.create();
      }
    } else {
      pdf = await PDFDocument.create();
    }

    const fonts: Fonts = {
      regular: await pdf.embedFont(StandardFonts.Helvetica),
      bold: await pdf.embedFont(StandardFonts.HelveticaBold),
      italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
      boldItalic: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
    };
    const mergeMap = buildMergeMap(quote, contact, company);

    if (usedTemplate) {
      const ctx: RenderCtx = { pdf, fonts, map: mergeMap, items: items || [], quote };

      // 1) Render structured blocks (text / details / product-list / …) at their
      //    absolute positions on top of the template PDF pages.
      for (const block of contentBlocks) {
        try {
          await renderBlock(block, ctx);
        } catch (e) {
          console.warn('block render failed', block?.type, e);
        }
      }

      // 2) Render legacy overlay fields (from the old PdfOverlayEditor).
      const pages = pdf.getPages();
      for (const fld of overlayFields) {
        const pageIdx = Math.max(0, Math.min(pages.length - 1, Number(fld.page || 0)));
        const p = pages[pageIdx];
        const { height: ph } = p.getSize();
        const rawValue = String(fld.value || fld.mergeTag || fld.label || '');
        const resolved = sanitize(resolveMergeTags(rawValue, mergeMap));
        if (!resolved) continue;
        const fontSize = Number(fld.fontSize) || 12;
        const font = pickFont(fonts, fld.fontWeight, fld.fontStyle);
        const color = fld.color ? hexToRgb(fld.color) : TEXT;
        const baselineY = ph - (Number(fld.y) || 0) - fontSize - 2;
        p.drawText(resolved, {
          x: Number(fld.x) || 0,
          y: Math.max(0, baselineY),
          size: fontSize,
          font,
          color,
          maxWidth: Number(fld.width) || undefined,
        });
      }

      // 3) If the template has no product-list block and there are line items,
      //    append a clean product overview page so the customer sees pricing.
      const hasProductList = contentBlocks.some((b) => b?.type === 'product-list');
      if (!hasProductList && items && items.length > 0) {
        appendProductOverviewPage(pdf, fonts, quote, items);
      }
    } else {
      // ─── Fallback: full branded PDF from scratch ───
      buildFallbackPdf(pdf, fonts, quote, items || []);
    }

    const pdfBytes = await pdf.save();
    const path = `${quote.user_id}/${quoteId}-${Date.now()}.pdf`;
    const { error: upErr } = await supabase.storage
      .from('quote-pdfs')
      .upload(path, pdfBytes, { contentType: 'application/pdf', upsert: true });
    if (upErr) {
      return new Response(JSON.stringify({ error: `Upload failed: ${upErr.message}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: pub } = supabase.storage.from('quote-pdfs').getPublicUrl(path);
    await supabase.from('quotes').update({ pdf_url: pub.publicUrl }).eq('id', quoteId);

    return new Response(JSON.stringify({
      pdfUrl: pub.publicUrl,
      filename: `${quote.display_number || 'offerte'}.pdf`,
      usedTemplate,
      blocksRendered: contentBlocks.length,
      overlaysRendered: overlayFields.length,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('generate-quote-pdf error', e);
    return new Response(JSON.stringify({ error: String((e as any)?.message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

/* ─── Append + fallback PDF helpers ──────────────────────────── */

function appendProductOverviewPage(pdf: PDFDocument, fonts: Fonts, quote: any, items: any[]) {
  let page = pdf.addPage([595, 842]);
  const { width, height } = page.getSize();
  const margin = 50;

  page.drawRectangle({ x: 0, y: height - 70, width, height: 70, color: BRAND_BROWN });
  page.drawText('Producten & diensten', {
    x: margin, y: height - 45, size: 18, font: fonts.bold, color: rgb(1, 1, 1),
  });
  page.drawText(quote.display_number || '', {
    x: width - margin - 120, y: height - 45, size: 12, font: fonts.regular, color: BRAND_GOLD,
  });

  drawProductTable(page, fonts, items.map((li) => ({
    name: li.item_name, description: li.description,
    quantity: li.quantity, unitPrice: Number(li.unit_price),
    vatRate: li.vat_rate, lineTotal: Number(li.line_total),
  })), margin, height - 100, width - 2 * margin, 620);

  // Totals block
  const tx = width - margin - 200;
  let ty = 180;
  page.drawText('Subtotaal', { x: tx, y: ty, size: 10, font: fonts.regular, color: TEXT });
  page.drawText(fmtEUR(Number(quote.subtotal)), { x: width - margin - 70, y: ty, size: 10, font: fonts.regular, color: TEXT });
  ty -= 14;
  if (Number(quote.discount_amount) > 0) {
    page.drawText('Korting', { x: tx, y: ty, size: 10, font: fonts.regular, color: TEXT });
    page.drawText(`- ${fmtEUR(Number(quote.discount_amount))}`, { x: width - margin - 70, y: ty, size: 10, font: fonts.regular, color: TEXT });
    ty -= 14;
  }
  page.drawText('BTW', { x: tx, y: ty, size: 10, font: fonts.regular, color: TEXT });
  page.drawText(fmtEUR(Number(quote.vat_amount)), { x: width - margin - 70, y: ty, size: 10, font: fonts.regular, color: TEXT });
  ty -= 18;
  page.drawLine({ start: { x: tx, y: ty + 6 }, end: { x: width - margin, y: ty + 6 }, color: BRAND_BROWN, thickness: 1 });
  page.drawText('Totaal', { x: tx, y: ty, size: 12, font: fonts.bold, color: BRAND_BROWN });
  page.drawText(fmtEUR(Number(quote.total)), { x: width - margin - 70, y: ty, size: 12, font: fonts.bold, color: BRAND_BROWN });
}

function buildFallbackPdf(pdf: PDFDocument, fonts: Fonts, quote: any, items: any[]) {
  let page = pdf.addPage([595, 842]);
  const { width, height } = page.getSize();
  const margin = 50;
  let y = height - margin;

  page.drawRectangle({ x: 0, y: height - 80, width, height: 80, color: BRAND_BROWN });
  page.drawText('Ontmoeten aan de Donge', { x: margin, y: height - 50, size: 20, font: fonts.bold, color: rgb(1, 1, 1) });
  page.drawText('OFFERTE', { x: width - margin - 80, y: height - 50, size: 16, font: fonts.bold, color: BRAND_GOLD });

  y = height - 110;
  page.drawText(sanitize(`Offertenummer: ${quote.display_number || ''}`), { x: margin, y, size: 10, font: fonts.regular, color: TEXT });
  y -= 14;
  page.drawText(sanitize(`Datum: ${fmtDate(quote.created_at)}`), { x: margin, y, size: 10, font: fonts.regular, color: TEXT });
  y -= 14;
  if (quote.valid_until) {
    page.drawText(sanitize(`Geldig tot: ${fmtDate(quote.valid_until)}`), { x: margin, y, size: 10, font: fonts.regular, color: TEXT });
    y -= 14;
  }

  let cy = height - 110;
  const clientX = width - margin - 220;
  page.drawText('Aan:', { x: clientX, y: cy, size: 10, font: fonts.bold, color: MUTED });
  cy -= 14;
  page.drawText(sanitize(quote.contact_name || ''), { x: clientX, y: cy, size: 11, font: fonts.bold, color: TEXT });
  cy -= 14;
  if (quote.company_name) { page.drawText(sanitize(quote.company_name), { x: clientX, y: cy, size: 10, font: fonts.regular, color: TEXT }); cy -= 12; }
  if (quote.client_address) {
    for (const line of String(quote.client_address).split('\n').slice(0, 3)) {
      page.drawText(sanitize(line.slice(0, 40)), { x: clientX, y: cy, size: 10, font: fonts.regular, color: TEXT });
      cy -= 12;
    }
  }

  y = Math.min(y, cy) - 24;
  page.drawText(sanitize(quote.title || 'Offerte'), { x: margin, y, size: 18, font: fonts.bold, color: BRAND_BROWN });
  y -= 24;

  if (items.length > 0) {
    drawProductTable(page, fonts, items.map((li) => ({
      name: li.item_name, description: li.description,
      quantity: li.quantity, unitPrice: Number(li.unit_price),
      vatRate: li.vat_rate, lineTotal: Number(li.line_total),
    })), margin, y, width - 2 * margin, y - 200);
    y = 180;
  }

  const tx = width - margin - 200;
  page.drawText('Subtotaal', { x: tx, y, size: 10, font: fonts.regular, color: TEXT });
  page.drawText(fmtEUR(Number(quote.subtotal)), { x: width - margin - 70, y, size: 10, font: fonts.regular, color: TEXT });
  y -= 14;
  page.drawText('BTW', { x: tx, y, size: 10, font: fonts.regular, color: TEXT });
  page.drawText(fmtEUR(Number(quote.vat_amount)), { x: width - margin - 70, y, size: 10, font: fonts.regular, color: TEXT });
  y -= 18;
  page.drawLine({ start: { x: tx, y: y + 6 }, end: { x: width - margin, y: y + 6 }, color: BRAND_BROWN, thickness: 1 });
  page.drawText('Totaal', { x: tx, y, size: 12, font: fonts.bold, color: BRAND_BROWN });
  page.drawText(fmtEUR(Number(quote.total)), { x: width - margin - 70, y, size: 12, font: fonts.bold, color: BRAND_BROWN });
}
