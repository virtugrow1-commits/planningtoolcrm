import { supabase } from '@/integrations/supabase/client';

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/push-to-eboekhouden`;

export async function pushInvoiceToEboekhouden(invoiceId: string): Promise<{ success: boolean; error?: string; mutationId?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { success: false, error: 'Niet ingelogd' };

  try {
    const res = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ invoice_id: invoiceId }),
    });

    const json = await res.json();

    if (!res.ok) {
      return { success: false, error: json.error || `HTTP ${res.status}` };
    }

    return { success: true, mutationId: json.mutation_id };
  } catch (err: any) {
    return { success: false, error: err.message || 'Verbindingsfout' };
  }
}

export async function saveEboekhoudenCredentials(
  userId: string,
  credentials: {
    username: string;
    securityCode1: string;
    securityCode2?: string;
  }
): Promise<boolean> {
  const entries = [
    { user_id: userId, key: 'eboekhouden_username', value: credentials.username },
    { user_id: userId, key: 'eboekhouden_security_code1', value: credentials.securityCode1 },
    { user_id: userId, key: 'eboekhouden_security_code2', value: credentials.securityCode2 || '' },
  ];

  const { error } = await supabase
    .from('app_settings')
    .upsert(entries, { onConflict: 'user_id,key' });

  return !error;
}

export async function loadEboekhoudenCredentials(userId: string) {
  const { data } = await supabase
    .from('app_settings')
    .select('key, value')
    .eq('user_id', userId)
    .in('key', ['eboekhouden_username', 'eboekhouden_security_code1', 'eboekhouden_security_code2']);

  const map: Record<string, string> = {};
  for (const s of data || []) map[s.key] = s.value || '';

  return {
    username: map['eboekhouden_username'] || '',
    securityCode1: map['eboekhouden_security_code1'] || '',
    securityCode2: map['eboekhouden_security_code2'] || '',
  };
}
