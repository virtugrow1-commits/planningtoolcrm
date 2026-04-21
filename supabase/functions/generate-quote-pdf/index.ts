// Generate a PDF for a quote.
// If the quote has a template PDF (pdf_url) the template is used as the base
// and overlay fields are drawn on top with merge tags resolved.
// Otherwise a clean styled PDF is built from scratch.

import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

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
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('nl-NL', { day: '2-digit', month: 'long', year: 'numeric' }); }
  catch { return s; }
}

/** Build the merge tag map from a quote row */
function buildMergeMap(quote: any): Record<string, string> {
  const total = Number(quote.total || 0);
  const sub = Number(quote.subtotal || 0);
  const vat = Number(quote.vat_amount || 0);
  return {
    '{{contact.name}}': quote.contact_name || '',
    '{{contact.first_name}}': (quote.contact_name || '').split(' ')[0] || '',
    '{{contact.last_name}}': (quote.contact_name || '').split(' ').slice(1).join(' ') || '',
    '{{contact.email}}': quote.client_email || '',
    '{{company.name}}': quote.company_name || '',
    '{{company.address}}': quote.client_address || '',
    '{{quote.display_number}}': quote.display_number || '',
    '{{quote.title}}': quote.title || '',
    '{{quote.subtotal}}': fmtEUR(sub),
    '{{quote.vat_amount}}': fmtEUR(vat),
    '{{quote.total}}': fmtEUR(total),
    '{{quote.valid_until}}': fmtDate(quote.valid_until),
    '{{date.today}}': new Date().toLocaleDateString('nl-NL'),
    '{{date.today_long}}': fmtDate(new Date().toISOString()),
    // legacy
    '{{client_name}}': quote.contact_name || '',
    '{{company_name}}': quote.company_name || '',
    '{{client_email}}': quote.client_email || '',
    '{{client_address}}': quote.client_address || '',
    '{{quote_number}}': quote.display_number || '',
    '{{date}}': new Date().toLocaleDateString('nl-NL'),
    '{{valid_until}}': fmtDate(quote.valid_until),
    '{{subtotal}}': fmtEUR(sub),
    '{{vat_amount}}': fmtEUR(vat),
    '{{total}}': fmtEUR(total),
  };
}

function resolveMergeTags(text: string, map: Record<string, string>): string {
  let out = text;
  for (const [tag, value] of Object.entries(map)) {
    const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(escaped, 'g'), value);
  }
  return out;
}

/** Convert a hex colour like #aabbcc to rgb(0..1) */
function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  return rgb(isNaN(r) ? 0 : r, isNaN(g) ? 0 : g, isNaN(b) ? 0 : b);
}

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

    const { data: items } = await supabase
      .from('quote_line_items').select('*').eq('quote_id', quoteId).order('sort_order');

    // Resolve template PDF: prefer the quote's saved overlay PDF, else fetch from template
    let templatePdfUrl: string | null = quote.pdf_url || null;
    let overlayFields: any[] = Array.isArray(quote.overlay_fields) ? quote.overlay_fields : [];

    if (!templatePdfUrl && quote.template_id) {
      const { data: tpl } = await supabase
        .from('quote_templates').select('content_blocks').eq('id', quote.template_id).single();
      const cb = tpl?.content_blocks as any;
      templatePdfUrl = cb?.pdfUrl || null;
      if (overlayFields.length === 0) overlayFields = cb?.overlayFields || [];
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

    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const mergeMap = buildMergeMap(quote);

    if (usedTemplate) {
      // Draw overlay fields on the template PDF
      const pages = pdf.getPages();
      for (const fld of overlayFields) {
        const pageIdx = Math.max(0, Math.min(pages.length - 1, Number(fld.page || 0)));
        const page = pages[pageIdx];
        const { width: pw, height: ph } = page.getSize();

        // Overlay coordinates use top-left origin in pixels relative to a rendered viewport.
        // The editor stores them in PDF point space (1pt = 1px in pdfjs scale=1). pdf-lib uses bottom-left.
        const x = Number(fld.x) || 0;
        const y = Number(fld.y) || 0;
        const fieldH = Number(fld.height) || 20;
        const fontSize = Number(fld.fontSize) || 12;

        const rawValue = String(fld.value || fld.label || '');
        const resolved = resolveMergeTags(rawValue, mergeMap);
        if (!resolved) continue;

        const useBold = (fld.fontWeight === 'bold');
        const colour = fld.color ? hexToRgb(fld.color) : TEXT;

        // Convert top-left y to bottom-left y, account for fontSize baseline
        const baselineY = ph - y - fontSize - 2;

        page.drawText(resolved, {
          x,
          y: Math.max(0, baselineY),
          size: fontSize,
          font: useBold ? fontBold : font,
          color: colour,
          maxWidth: Number(fld.width) || pw - x - 20,
        });
      }

      // ─── Append a product overview page after the template pages ───
      // This guarantees the products always show up in the email attachment,
      // even when the template's PDF doesn't include a product table.
      if (items && items.length > 0) {
        let page = pdf.addPage([595, 842]);
        const { width, height } = page.getSize();
        const margin = 50;
        let y = height - margin;

        // Header band
        page.drawRectangle({ x: 0, y: height - 70, width, height: 70, color: BRAND_BROWN });
        page.drawText('Producten & diensten', {
          x: margin, y: height - 45, size: 18, font: fontBold, color: rgb(1, 1, 1),
        });
        page.drawText(quote.display_number || '', {
          x: width - margin - 100, y: height - 45, size: 12, font, color: BRAND_GOLD,
        });
        y = height - 100;

        // Table header
        page.drawRectangle({ x: margin, y: y - 4, width: width - 2 * margin, height: 22, color: BRAND_GOLD });
        page.drawText('Omschrijving', { x: margin + 8, y: y + 4, size: 10, font: fontBold, color: TEXT });
        page.drawText('Aantal', { x: width - margin - 200, y: y + 4, size: 10, font: fontBold, color: TEXT });
        page.drawText('Prijs', { x: width - margin - 140, y: y + 4, size: 10, font: fontBold, color: TEXT });
        page.drawText('BTW', { x: width - margin - 80, y: y + 4, size: 10, font: fontBold, color: TEXT });
        page.drawText('Totaal', { x: width - margin - 50, y: y + 4, size: 10, font: fontBold, color: TEXT });
        y -= 26;

        for (const li of items) {
          if (y < 140) { page = pdf.addPage([595, 842]); y = height - margin; }
          page.drawText(String(li.item_name || '').slice(0, 50), { x: margin + 8, y, size: 10, font, color: TEXT });
          page.drawText(String(li.quantity), { x: width - margin - 200, y, size: 10, font, color: TEXT });
          page.drawText(fmtEUR(Number(li.unit_price)), { x: width - margin - 140, y, size: 10, font, color: TEXT });
          page.drawText(`${li.vat_rate}%`, { x: width - margin - 80, y, size: 10, font, color: TEXT });
          page.drawText(fmtEUR(Number(li.line_total)), { x: width - margin - 50, y, size: 10, font, color: TEXT });
          y -= 16;
          if (li.description) {
            const dLines = wrapText(String(li.description), font, 9, width - 2 * margin - 16);
            for (const dl of dLines.slice(0, 3)) {
              page.drawText(dl, { x: margin + 16, y, size: 9, font, color: MUTED });
              y -= 12;
            }
          }
        }
        y -= 14;

        if (y < 140) { page = pdf.addPage([595, 842]); y = height - margin; }
        const tx = width - margin - 200;
        page.drawText('Subtotaal', { x: tx, y, size: 10, font, color: TEXT });
        page.drawText(fmtEUR(Number(quote.subtotal)), { x: width - margin - 70, y, size: 10, font, color: TEXT });
        y -= 14;
        if (Number(quote.discount_amount) > 0) {
          page.drawText('Korting', { x: tx, y, size: 10, font, color: TEXT });
          page.drawText(`- ${fmtEUR(Number(quote.discount_amount))}`, { x: width - margin - 70, y, size: 10, font, color: TEXT });
          y -= 14;
        }
        page.drawText('BTW', { x: tx, y, size: 10, font, color: TEXT });
        page.drawText(fmtEUR(Number(quote.vat_amount)), { x: width - margin - 70, y, size: 10, font, color: TEXT });
        y -= 18;
        page.drawLine({ start: { x: tx, y: y + 6 }, end: { x: width - margin, y: y + 6 }, color: BRAND_BROWN, thickness: 1 });
        page.drawText('Totaal', { x: tx, y, size: 12, font: fontBold, color: BRAND_BROWN });
        page.drawText(fmtEUR(Number(quote.total)), { x: width - margin - 70, y, size: 12, font: fontBold, color: BRAND_BROWN });
      }
    } else {
      // ─── Fallback: generate clean branded PDF from scratch ───
      let page = pdf.addPage([595, 842]);
      const { width, height } = page.getSize();
      const margin = 50;
      let y = height - margin;

      page.drawRectangle({ x: 0, y: height - 80, width, height: 80, color: BRAND_BROWN });
      page.drawText('Ontmoeten aan de Donge', { x: margin, y: height - 50, size: 20, font: fontBold, color: rgb(1, 1, 1) });
      page.drawText('OFFERTE', { x: width - margin - 80, y: height - 50, size: 16, font: fontBold, color: BRAND_GOLD });

      y = height - 110;
      page.drawText(`Offertenummer: ${quote.display_number || ''}`, { x: margin, y, size: 10, font, color: TEXT });
      y -= 14;
      page.drawText(`Datum: ${fmtDate(quote.created_at)}`, { x: margin, y, size: 10, font, color: TEXT });
      y -= 14;
      if (quote.valid_until) {
        page.drawText(`Geldig tot: ${fmtDate(quote.valid_until)}`, { x: margin, y, size: 10, font, color: TEXT });
        y -= 14;
      }

      let cy = height - 110;
      const clientX = width - margin - 220;
      page.drawText('Aan:', { x: clientX, y: cy, size: 10, font: fontBold, color: MUTED });
      cy -= 14;
      page.drawText(quote.contact_name || '', { x: clientX, y: cy, size: 11, font: fontBold, color: TEXT });
      cy -= 14;
      if (quote.company_name) { page.drawText(quote.company_name, { x: clientX, y: cy, size: 10, font, color: TEXT }); cy -= 12; }
      if (quote.client_address) {
        for (const line of String(quote.client_address).split('\n').slice(0, 3)) {
          page.drawText(line.slice(0, 40), { x: clientX, y: cy, size: 10, font, color: TEXT });
          cy -= 12;
        }
      }
      if (quote.client_email) page.drawText(quote.client_email.slice(0, 40), { x: clientX, y: cy, size: 10, font, color: MUTED });

      y = Math.min(y, cy) - 24;
      page.drawText(quote.title || 'Offerte', { x: margin, y, size: 18, font: fontBold, color: BRAND_BROWN });
      y -= 24;

      if (quote.introduction) {
        const lines = wrapText(String(quote.introduction), font, 10, width - 2 * margin);
        for (const line of lines) {
          if (y < 200) { page = pdf.addPage([595, 842]); y = height - margin; }
          page.drawText(line, { x: margin, y, size: 10, font, color: TEXT });
          y -= 13;
        }
        y -= 10;
      }

      if (items && items.length > 0) {
        page.drawRectangle({ x: margin, y: y - 4, width: width - 2 * margin, height: 22, color: BRAND_GOLD });
        page.drawText('Omschrijving', { x: margin + 8, y: y + 4, size: 10, font: fontBold, color: TEXT });
        page.drawText('Aantal', { x: width - margin - 200, y: y + 4, size: 10, font: fontBold, color: TEXT });
        page.drawText('Prijs', { x: width - margin - 140, y: y + 4, size: 10, font: fontBold, color: TEXT });
        page.drawText('BTW', { x: width - margin - 80, y: y + 4, size: 10, font: fontBold, color: TEXT });
        page.drawText('Totaal', { x: width - margin - 50, y: y + 4, size: 10, font: fontBold, color: TEXT });
        y -= 22;
        for (const li of items) {
          if (y < 140) { page = pdf.addPage([595, 842]); y = height - margin; }
          page.drawText(String(li.item_name || '').slice(0, 50), { x: margin + 8, y, size: 10, font, color: TEXT });
          page.drawText(String(li.quantity), { x: width - margin - 200, y, size: 10, font, color: TEXT });
          page.drawText(fmtEUR(Number(li.unit_price)), { x: width - margin - 140, y, size: 10, font, color: TEXT });
          page.drawText(`${li.vat_rate}%`, { x: width - margin - 80, y, size: 10, font, color: TEXT });
          page.drawText(fmtEUR(Number(li.line_total)), { x: width - margin - 50, y, size: 10, font, color: TEXT });
          y -= 16;
          if (li.description) {
            const dLines = wrapText(String(li.description), font, 9, width - 2 * margin - 16);
            for (const dl of dLines.slice(0, 3)) { page.drawText(dl, { x: margin + 16, y, size: 9, font, color: MUTED }); y -= 12; }
          }
        }
        y -= 10;
      }

      if (y < 140) { page = pdf.addPage([595, 842]); y = height - margin; }
      const tx = width - margin - 200;
      page.drawText('Subtotaal', { x: tx, y, size: 10, font, color: TEXT });
      page.drawText(fmtEUR(Number(quote.subtotal)), { x: width - margin - 70, y, size: 10, font, color: TEXT });
      y -= 14;
      if (Number(quote.discount_amount) > 0) {
        page.drawText('Korting', { x: tx, y, size: 10, font, color: TEXT });
        page.drawText(`- ${fmtEUR(Number(quote.discount_amount))}`, { x: width - margin - 70, y, size: 10, font, color: TEXT });
        y -= 14;
      }
      page.drawText('BTW', { x: tx, y, size: 10, font, color: TEXT });
      page.drawText(fmtEUR(Number(quote.vat_amount)), { x: width - margin - 70, y, size: 10, font, color: TEXT });
      y -= 18;
      page.drawLine({ start: { x: tx, y: y + 6 }, end: { x: width - margin, y: y + 6 }, color: BRAND_BROWN, thickness: 1 });
      page.drawText('Totaal', { x: tx, y, size: 12, font: fontBold, color: BRAND_BROWN });
      page.drawText(fmtEUR(Number(quote.total)), { x: width - margin - 70, y, size: 12, font: fontBold, color: BRAND_BROWN });
      y -= 30;

      if (quote.terms_and_conditions) {
        if (y < 120) { page = pdf.addPage([595, 842]); y = height - margin; }
        page.drawText('Voorwaarden', { x: margin, y, size: 11, font: fontBold, color: BRAND_BROWN });
        y -= 16;
        const lines = wrapText(String(quote.terms_and_conditions), font, 9, width - 2 * margin);
        for (const line of lines) {
          if (y < 60) { page = pdf.addPage([595, 842]); y = height - margin; }
          page.drawText(line, { x: margin, y, size: 9, font, color: MUTED });
          y -= 12;
        }
      }

      const pages = pdf.getPages();
      pages.forEach((p, i) => {
        p.drawText(`Pagina ${i + 1} van ${pages.length}`, { x: width - margin - 80, y: 30, size: 8, font, color: MUTED });
        p.drawText('contact@ontmoetenaandedonge.nl', { x: margin, y: 30, size: 8, font, color: MUTED });
      });
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

    // NOTE: Do NOT return pdfBase64 here — base64-encoding the full PDF in memory
    // causes WORKER_RESOURCE_LIMIT (memory) errors on edge runtime. Consumers
    // (e.g. send-quote-email) should download the PDF from pdfUrl and stream it.
    return new Response(JSON.stringify({
      pdfUrl: pub.publicUrl,
      filename: `${quote.display_number || 'offerte'}.pdf`,
      usedTemplate,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('generate-quote-pdf error', e);
    return new Response(JSON.stringify({ error: String((e as any)?.message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function wrapText(text: string, font: any, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(' ');
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      const width = font.widthOfTextAtSize(test, size);
      if (width > maxWidth && line) { out.push(line); line = w; } else { line = test; }
    }
    if (line) out.push(line);
  }
  return out;
}
