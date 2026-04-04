/**
 * Supabase Edge Function: push-to-eboekhouden
 * Pushes an invoice to e-Boekhouden.nl via SOAP API.
 *
 * POST body: { invoice_id: string }
 * Headers: Authorization: Bearer <supabase-anon-key>
 *
 * Reads e-boekhouden credentials from app_settings table.
 * BTW codes: HOOG_VERK (21%), LAAG_VERK (9%), GEEN (0%)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EBOEKHOUDEN_SOAP_URL = 'https://soap.e-boekhouden.nl/boekhouden.asmx';
const SOURCE_APP = 'PlanningToolCRM';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const { invoice_id } = await req.json();
    if (!invoice_id) {
      return jsonError('invoice_id is required', 400);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonError('Unauthorized', 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get user from JWT
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !user) return jsonError('Unauthorized', 401);

    // Get e-boekhouden credentials from settings
    const { data: settings } = await supabase
      .from('app_settings')
      .select('key, value')
      .eq('user_id', user.id)
      .in('key', ['eboekhouden_username', 'eboekhouden_security_code1', 'eboekhouden_security_code2']);

    const settingsMap: Record<string, string> = {};
    for (const s of settings || []) settingsMap[s.key] = s.value || '';

    const username = settingsMap['eboekhouden_username'];
    const code1 = settingsMap['eboekhouden_security_code1'];
    const code2 = settingsMap['eboekhouden_security_code2'];

    if (!username || !code1) {
      return jsonError('e-Boekhouden credentials niet ingesteld. Ga naar Instellingen.', 400);
    }

    // Get invoice with line items
    const { data: inv, error: invError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoice_id)
      .single();

    if (invError || !inv) return jsonError('Factuur niet gevonden', 404);

    if (inv.eboekhouden_mutation_id) {
      return jsonError('Factuur is al doorgestuurd naar e-Boekhouden', 409);
    }

    const { data: lineItems } = await supabase
      .from('invoice_line_items')
      .select('*')
      .eq('invoice_id', invoice_id)
      .order('sort_order');

    // Open session
    const sessionId = await openSession(username, code1, code2 || '');
    if (!sessionId) return jsonError('e-Boekhouden authenticatie mislukt', 401);

    // Build mutation XML
    const mutationRules = (lineItems || []).map((li: any) => {
      const excl = Number(li.unit_price) * Number(li.quantity) * (1 - Number(li.discount_percent) / 100);
      const vatPct = Number(li.vat_rate);
      const vat = excl * (vatPct / 100);
      const incl = excl + vat;
      const btwCode = vatPct === 21 ? 'HOOG_VERK' : vatPct === 9 ? 'LAAG_VERK' : 'GEEN';

      return `
        <cMutatieRegel>
          <Omschrijving>${escapeXml(li.item_name)}</Omschrijving>
          <BedragInvoer>${incl.toFixed(2)}</BedragInvoer>
          <BedragExclBTW>${excl.toFixed(2)}</BedragExclBTW>
          <BedragBTW>${vat.toFixed(2)}</BedragBTW>
          <BedragInclBTW>${incl.toFixed(2)}</BedragInclBTW>
          <BTWCode>${btwCode}</BTWCode>
          <TegenrekeningCode>8000</TegenrekeningCode>
        </cMutatieRegel>`;
    }).join('');

    const dueDate = inv.due_date || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    const invDate = (inv.sent_at || inv.created_at).split('T')[0];
    const paymentDays = Math.round(
      (new Date(dueDate).getTime() - new Date(invDate).getTime()) / 86400000
    );

    const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:bh="https://soap.e-boekhouden.nl/boekhouden.asmx">
  <soap:Body>
    <bh:AddMutatie>
      <bh:SessionID>${sessionId}</bh:SessionID>
      <bh:oMut>
        <bh:Soort>FactuurVerstuurd</bh:Soort>
        <bh:Datum>${invDate}</bh:Datum>
        <bh:Omschrijving>${escapeXml(inv.title)}</bh:Omschrijving>
        <bh:Bedrag>${Number(inv.total).toFixed(2)}</bh:Bedrag>
        <bh:Relatiecode>${escapeXml(inv.company_name || inv.contact_name || '')}</bh:Relatiecode>
        <bh:Factuurstatus>Verstuurd</bh:Factuurstatus>
        <bh:FactuurNummer>${escapeXml(inv.display_number || '')}</bh:FactuurNummer>
        <bh:BetalingstermijnDagen>${paymentDays}</bh:BetalingstermijnDagen>
        <bh:MutatieRegels>${mutationRules}</bh:MutatieRegels>
      </bh:oMut>
    </bh:AddMutatie>
  </soap:Body>
</soap:Envelope>`;

    const mutResponse = await fetch(EBOEKHOUDEN_SOAP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'https://soap.e-boekhouden.nl/boekhouden.asmx/AddMutatie',
      },
      body: soapBody,
    });

    const mutXml = await mutResponse.text();

    // Close session (best effort)
    await closeSession(sessionId);

    // Extract mutation ID from response
    const mutIdMatch = mutXml.match(/<Mutatienummer>(\d+)<\/Mutatienummer>/);
    const errorMatch = mutXml.match(/<ErrorMsg>(.*?)<\/ErrorMsg>/s);

    if (errorMatch && errorMatch[1].trim()) {
      return jsonError(`e-Boekhouden fout: ${errorMatch[1].trim()}`, 422);
    }

    const mutationId = mutIdMatch ? mutIdMatch[1] : null;

    // Save mutation ID to invoice
    await supabase
      .from('invoices')
      .update({ eboekhouden_mutation_id: mutationId || `sent-${Date.now()}` })
      .eq('id', invoice_id);

    return new Response(
      JSON.stringify({ success: true, mutation_id: mutationId }),
      { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );

  } catch (err: any) {
    console.error('push-to-eboekhouden error:', err);
    return jsonError(err.message || 'Onbekende fout', 500);
  }
});

async function openSession(username: string, code1: string, code2: string): Promise<string | null> {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:bh="https://soap.e-boekhouden.nl/boekhouden.asmx">
  <soap:Body>
    <bh:OpenSession>
      <bh:Username>${escapeXml(username)}</bh:Username>
      <bh:SecurityCode1>${escapeXml(code1)}</bh:SecurityCode1>
      <bh:SecurityCode2>${escapeXml(code2)}</bh:SecurityCode2>
      <bh:SourceApplication>${SOURCE_APP}</bh:SourceApplication>
      <bh:IPAddress></bh:IPAddress>
    </bh:OpenSession>
  </soap:Body>
</soap:Envelope>`;

  const res = await fetch(EBOEKHOUDEN_SOAP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': 'https://soap.e-boekhouden.nl/boekhouden.asmx/OpenSession',
    },
    body: xml,
  });

  const text = await res.text();
  const match = text.match(/<SessionID>(.*?)<\/SessionID>/);
  return match ? match[1] : null;
}

async function closeSession(sessionId: string) {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:bh="https://soap.e-boekhouden.nl/boekhouden.asmx">
  <soap:Body>
    <bh:CloseSession>
      <bh:SessionID>${sessionId}</bh:SessionID>
    </bh:CloseSession>
  </soap:Body>
</soap:Envelope>`;

  await fetch(EBOEKHOUDEN_SOAP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': 'https://soap.e-boekhouden.nl/boekhouden.asmx/CloseSession',
    },
    body: xml,
  }).catch(() => {});
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function jsonError(message: string, status: number) {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
}
