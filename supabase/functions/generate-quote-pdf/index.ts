// Generate a styled PDF for a quote and store it in the quote-pdfs bucket
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Brand colours (warm bruin / goud)
const BRAND_BROWN = rgb(0.62, 0.32, 0.23); // #9e523a
const BRAND_GOLD = rgb(0.89, 0.73, 0.48);  // #e4bb7a
const TEXT = rgb(0.15, 0.15, 0.15);
const MUTED = rgb(0.45, 0.45, 0.45);

function fmtEUR(n: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n || 0);
}

function fmtDate(s?: string | null) {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleDateString('nl-NL', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch { return s; }
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

    // Build PDF
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    let page = pdf.addPage([595, 842]); // A4
    const { width, height } = page.getSize();
    const margin = 50;
    let y = height - margin;

    // Header bar
    page.drawRectangle({ x: 0, y: height - 80, width, height: 80, color: BRAND_BROWN });
    page.drawText('Ontmoeten aan de Donge', {
      x: margin, y: height - 50, size: 20, font: fontBold, color: rgb(1, 1, 1),
    });
    page.drawText('OFFERTE', {
      x: width - margin - 80, y: height - 50, size: 16, font: fontBold, color: BRAND_GOLD,
    });

    y = height - 110;

    // Quote meta
    page.drawText(`Offertenummer: ${quote.display_number || ''}`, { x: margin, y, size: 10, font, color: TEXT });
    y -= 14;
    page.drawText(`Datum: ${fmtDate(quote.created_at)}`, { x: margin, y, size: 10, font, color: TEXT });
    y -= 14;
    if (quote.valid_until) {
      page.drawText(`Geldig tot: ${fmtDate(quote.valid_until)}`, { x: margin, y, size: 10, font, color: TEXT });
      y -= 14;
    }

    // Client block (right)
    let cy = height - 110;
    const clientX = width - margin - 220;
    page.drawText('Aan:', { x: clientX, y: cy, size: 10, font: fontBold, color: MUTED });
    cy -= 14;
    page.drawText(quote.contact_name || '', { x: clientX, y: cy, size: 11, font: fontBold, color: TEXT });
    cy -= 14;
    if (quote.company_name) {
      page.drawText(quote.company_name, { x: clientX, y: cy, size: 10, font, color: TEXT });
      cy -= 12;
    }
    if (quote.client_address) {
      const lines = String(quote.client_address).split('\n').slice(0, 3);
      for (const line of lines) {
        page.drawText(line.slice(0, 40), { x: clientX, y: cy, size: 10, font, color: TEXT });
        cy -= 12;
      }
    }
    if (quote.client_email) {
      page.drawText(quote.client_email.slice(0, 40), { x: clientX, y: cy, size: 10, font, color: MUTED });
    }

    y = Math.min(y, cy) - 24;

    // Title
    page.drawText(quote.title || 'Offerte', { x: margin, y, size: 18, font: fontBold, color: BRAND_BROWN });
    y -= 24;

    // Introduction
    if (quote.introduction) {
      const lines = wrapText(String(quote.introduction), font, 10, width - 2 * margin);
      for (const line of lines) {
        if (y < 200) { page = pdf.addPage([595, 842]); y = height - margin; }
        page.drawText(line, { x: margin, y, size: 10, font, color: TEXT });
        y -= 13;
      }
      y -= 10;
    }

    // Line items table
    if (items && items.length > 0) {
      // Header row
      page.drawRectangle({ x: margin, y: y - 4, width: width - 2 * margin, height: 22, color: BRAND_GOLD });
      page.drawText('Omschrijving', { x: margin + 8, y: y + 4, size: 10, font: fontBold, color: TEXT });
      page.drawText('Aantal', { x: width - margin - 200, y: y + 4, size: 10, font: fontBold, color: TEXT });
      page.drawText('Prijs', { x: width - margin - 140, y: y + 4, size: 10, font: fontBold, color: TEXT });
      page.drawText('BTW', { x: width - margin - 80, y: y + 4, size: 10, font: fontBold, color: TEXT });
      page.drawText('Totaal', { x: width - margin - 50, y: y + 4, size: 10, font: fontBold, color: TEXT });
      y -= 22;

      for (const li of items) {
        if (y < 140) { page = pdf.addPage([595, 842]); y = height - margin; }
        const name = String(li.item_name || '').slice(0, 50);
        page.drawText(name, { x: margin + 8, y, size: 10, font, color: TEXT });
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

      y -= 10;
    }

    // Totals box
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

    // Terms
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

    // Footer on each page
    const pages = pdf.getPages();
    pages.forEach((p, i) => {
      p.drawText(`Pagina ${i + 1} van ${pages.length}`, {
        x: width - margin - 80, y: 30, size: 8, font, color: MUTED,
      });
      p.drawText('contact@ontmoetenaandedonge.nl', {
        x: margin, y: 30, size: 8, font, color: MUTED,
      });
    });

    const pdfBytes = await pdf.save();

    // Upload
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

    // Save url back to quote
    await supabase.from('quotes').update({ pdf_url: pub.publicUrl }).eq('id', quoteId);

    return new Response(JSON.stringify({
      pdfUrl: pub.publicUrl,
      pdfBase64: btoa(String.fromCharCode(...new Uint8Array(pdfBytes))),
      filename: `${quote.display_number || 'offerte'}.pdf`,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('generate-quote-pdf error', e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
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
      if (width > maxWidth && line) {
        out.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) out.push(line);
  }
  return out;
}
