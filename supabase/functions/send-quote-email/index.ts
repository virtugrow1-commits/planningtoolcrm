// Send a quote to a client via email with PDF attachment
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;

const FROM_EMAIL = 'contact@send.ontmoetenaandedonge.nl';
const FROM_NAME = 'Ontmoeten aan de Donge';
const REPLY_TO = 'contact@ontmoetenaandedonge.nl';

function fmtEUR(n: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n || 0);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { quoteId, recipientEmail, subject, message } = await req.json();
    if (!quoteId || !recipientEmail) {
      return new Response(JSON.stringify({ error: 'quoteId and recipientEmail are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load quote
    const { data: quote, error: qErr } = await supabase
      .from('quotes').select('*').eq('id', quoteId).single();
    if (qErr || !quote) {
      return new Response(JSON.stringify({ error: 'Quote not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Refresh snapshot fields from the linked CRM records so the PDF always
    // uses the most up-to-date contact/company data (name, email, address).
    try {
      const snapshot: Record<string, any> = {};
      if (quote.contact_id) {
        const { data: c } = await supabase.from('contacts')
          .select('first_name, last_name, email, phone')
          .eq('id', quote.contact_id).maybeSingle();
        if (c) {
          const full = [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
          if (full && !quote.contact_name) snapshot.contact_name = full;
          if (c.email && !quote.client_email) snapshot.client_email = c.email;
        }
      }
      if (quote.company_id) {
        const { data: co } = await supabase.from('companies')
          .select('name, address, postcode, city')
          .eq('id', quote.company_id).maybeSingle();
        if (co) {
          if (co.name && !quote.company_name) snapshot.company_name = co.name;
          const addr = [co.address, co.postcode, co.city].filter(Boolean).join(', ');
          if (addr && !quote.client_address) snapshot.client_address = addr;
        }
      }
      if (Object.keys(snapshot).length > 0) {
        await supabase.from('quotes').update(snapshot).eq('id', quoteId);
        Object.assign(quote, snapshot);
      }
    } catch (e) {
      console.warn('snapshot refresh failed', e);
    }

    // Generate PDF (call our own function) — only returns pdfUrl now
    const pdfRes = await fetch(`${SUPABASE_URL}/functions/v1/generate-quote-pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ quoteId }),
    });
    if (!pdfRes.ok) {
      const err = await pdfRes.text();
      return new Response(JSON.stringify({ error: `PDF generatie mislukt: ${err}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { pdfUrl, filename } = await pdfRes.json();

    // Download the PDF from storage and base64-encode it for the email attachment
    let pdfBase64 = '';
    if (pdfUrl) {
      const pdfDownload = await fetch(pdfUrl);
      if (pdfDownload.ok) {
        const buf = new Uint8Array(await pdfDownload.arrayBuffer());
        let bin = '';
        for (let i = 0; i < buf.length; i += 0x8000) {
          bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + 0x8000)));
        }
        pdfBase64 = btoa(bin);
      }
    }

    // Build public link
    const origin = req.headers.get('origin') || 'https://planningtoolcrm.lovable.app';
    const publicLink = quote.public_token ? `${origin}/quote/view/${quote.public_token}` : null;

    const finalSubject = subject || `Offerte ${quote.display_number || ''} van ${FROM_NAME}`;
    const greeting = quote.contact_name ? `Beste ${quote.contact_name},` : 'Beste,';

    const html = `
<!DOCTYPE html>
<html lang="nl"><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f5f1ec;font-family:Arial,Helvetica,sans-serif;color:#222;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f1ec;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
        <tr><td style="background:#9e523a;padding:24px 32px;color:#ffffff;">
          <div style="font-size:20px;font-weight:bold;">${FROM_NAME}</div>
          <div style="font-size:13px;color:#e4bb7a;letter-spacing:1px;">OFFERTE ${escapeHtml(quote.display_number || '')}</div>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 16px;font-size:15px;">${escapeHtml(greeting)}</p>
          ${message ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(message)}</p>` : `
          <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">
            Hartelijk dank voor uw interesse. In de bijlage vindt u onze offerte
            <strong>${escapeHtml(quote.display_number || '')}</strong> voor <strong>${escapeHtml(quote.title || '')}</strong>
            met een totaalbedrag van <strong>${fmtEUR(Number(quote.total))}</strong>.
          </p>`}
          ${publicLink ? `
          <div style="margin:24px 0;text-align:center;">
            <a href="${publicLink}" style="display:inline-block;background:#9e523a;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:bold;font-size:14px;">Bekijk offerte online</a>
          </div>` : ''}
          <p style="margin:24px 0 0;font-size:14px;line-height:1.6;">
            Heeft u vragen? Reageer dan gerust op deze e-mail of bel ons.
          </p>
          <p style="margin:24px 0 0;font-size:14px;">Met vriendelijke groet,<br/><strong>${FROM_NAME}</strong></p>
        </td></tr>
        <tr><td style="background:#f5f1ec;padding:16px 32px;text-align:center;font-size:12px;color:#7a6a5a;border-top:3px solid #e4bb7a;">
          ${FROM_NAME} · contact@ontmoetenaandedonge.nl
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    // Send via Resend
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: [recipientEmail],
        reply_to: REPLY_TO,
        subject: finalSubject,
        html,
        attachments: [{
          filename: filename || `${quote.display_number || 'offerte'}.pdf`,
          content: pdfBase64,
        }],
      }),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text();
      console.error('Email send failed', emailRes.status, errText);
      return new Response(JSON.stringify({
        error: 'E-mail verzending mislukt',
        details: errText,
        status: emailRes.status,
      }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Update quote status + tracking
    const now = new Date().toISOString();
    await supabase.from('quotes').update({
      status: quote.status === 'draft' ? 'sent' : quote.status,
      sent_at: quote.sent_at || now,
      last_sent_to: recipientEmail,
      last_sent_at: now,
    }).eq('id', quoteId);

    // Activity log on linked contact
    if (quote.contact_id) {
      await supabase.from('contact_activities').insert({
        user_id: user.id,
        contact_id: quote.contact_id,
        type: 'email',
        subject: `Offerte ${quote.display_number} verzonden`,
        body: `Verzonden naar ${recipientEmail}\nOnderwerp: ${finalSubject}`,
      });
    }

    return new Response(JSON.stringify({ ok: true, sentTo: recipientEmail, sentAt: now }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('send-quote-email error', e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
