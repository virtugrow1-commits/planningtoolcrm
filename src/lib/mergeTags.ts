import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

export interface MergeTagData {
  contact?: {
    name?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    job_title?: string;
    department?: string;
  };
  company?: {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    postcode?: string;
    city?: string;
    country?: string;
    kvk?: string;
    btw_number?: string;
    website?: string;
  };
  quote?: {
    display_number?: string;
    title?: string;
    subtotal?: number;
    vat_amount?: number;
    total?: number;
    valid_until?: string;
  };
  inquiry?: Record<string, string>;
  booking?: Record<string, string>;
  user?: {
    name?: string;
    email?: string;
  };
}

/** Build the merge tag map from data */
function buildMap(data: MergeTagData): Record<string, string> {
  const c = data.contact || {};
  const co = data.company || {};
  const q = data.quote || {};
  const i = data.inquiry || {};
  const b = data.booking || {};
  const u = data.user || {};

  const today = new Date();

  return {
    '{{contact.name}}': c.name || [c.first_name, c.last_name].filter(Boolean).join(' ') || '',
    '{{contact.first_name}}': c.first_name || '',
    '{{contact.last_name}}': c.last_name || '',
    '{{contact.email}}': c.email || '',
    '{{contact.phone}}': c.phone || '',
    '{{contact.job_title}}': c.job_title || '',
    '{{contact.department}}': c.department || '',

    '{{company.name}}': co.name || '',
    '{{company.email}}': co.email || '',
    '{{company.phone}}': co.phone || '',
    '{{company.address}}': co.address || '',
    '{{company.postcode}}': co.postcode || '',
    '{{company.city}}': co.city || '',
    '{{company.country}}': co.country || '',
    '{{company.kvk}}': co.kvk || '',
    '{{company.btw_number}}': co.btw_number || '',
    '{{company.website}}': co.website || '',

    '{{quote.display_number}}': q.display_number || '',
    '{{quote.title}}': q.title || '',
    '{{quote.subtotal}}': q.subtotal != null ? `€ ${Number(q.subtotal).toFixed(2)}` : '',
    '{{quote.vat_amount}}': q.vat_amount != null ? `€ ${Number(q.vat_amount).toFixed(2)}` : '',
    '{{quote.total}}': q.total != null ? `€ ${Number(q.total).toFixed(2)}` : '',
    '{{quote.valid_until}}': q.valid_until
      ? format(new Date(q.valid_until), 'dd MMMM yyyy', { locale: nl })
      : '',

    '{{inquiry.display_number}}': i.display_number || '',
    '{{inquiry.event_type}}': i.event_type || '',
    '{{inquiry.guest_count}}': i.guest_count || '',
    '{{inquiry.preferred_date}}': i.preferred_date || '',
    '{{inquiry.preferred_start_time}}': i.preferred_start_time || '',
    '{{inquiry.preferred_end_time}}': i.preferred_end_time || '',
    '{{inquiry.room_preference}}': i.room_preference || '',
    '{{inquiry.budget}}': i.budget || '',
    '{{inquiry.status}}': i.status || '',

    '{{booking.reservation_number}}': b.reservation_number || '',
    '{{booking.title}}': b.title || '',
    '{{booking.date}}': b.date || '',
    '{{booking.start_time}}': b.start_time || '',
    '{{booking.end_time}}': b.end_time || '',
    '{{booking.room_name}}': b.room_name || '',
    '{{booking.guest_count}}': b.guest_count || '',
    '{{booking.room_setup}}': b.room_setup || '',
    '{{booking.status}}': b.status || '',

    '{{date.today}}': format(today, 'dd-MM-yyyy'),
    '{{date.today_long}}': format(today, 'dd MMMM yyyy', { locale: nl }),
    '{{user.name}}': u.name || '',
    '{{user.email}}': u.email || '',

    // Legacy support for old-style tags
    '{{client_name}}': c.name || '',
    '{{company_name}}': co.name || '',
    '{{client_email}}': c.email || '',
    '{{client_address}}': [co.address, co.postcode, co.city].filter(Boolean).join(', ') || '',
    '{{quote_number}}': q.display_number || '',
    '{{date}}': format(today, 'dd-MM-yyyy'),
    '{{valid_until}}': q.valid_until
      ? format(new Date(q.valid_until), 'dd MMMM yyyy', { locale: nl })
      : '',
    '{{subtotal}}': q.subtotal != null ? `€ ${Number(q.subtotal).toFixed(2)}` : '',
    '{{vat_amount}}': q.vat_amount != null ? `€ ${Number(q.vat_amount).toFixed(2)}` : '',
    '{{total}}': q.total != null ? `€ ${Number(q.total).toFixed(2)}` : '',
  };
}

/** Replace all {{tag}} occurrences in a plain text or HTML string */
export function resolveMergeTags(content: string, data: MergeTagData): string {
  if (!content) return content;
  const map = buildMap(data);
  let result = content;
  for (const [tag, value] of Object.entries(map)) {
    // Escape special regex chars in the tag (braces, dots)
    const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'g'), value);
  }
  return result;
}

/** Resolve merge tags inside a deep block object (for content_blocks JSON) */
export function resolveBlocksMergeTags(blocks: any[], data: MergeTagData): any[] {
  return blocks.map((block) => resolveBlock(block, data));
}

function resolveBlock(block: any, data: MergeTagData): any {
  const resolved = { ...block };

  switch (block.type) {
    case 'text':
      resolved.content = resolveMergeTags(block.content || '', data);
      break;
    case 'details':
      resolved.fields = (block.fields || []).map((f: any) => ({
        ...f,
        // Keep merge tag as-is (for template), resolve value separately
        resolvedValue: resolveMergeTags(f.mergeTag || '', data),
      }));
      break;
    case 'text-field':
      resolved.resolvedValue = resolveMergeTags(block.mergeTag || '', data);
      break;
    case 'date-field':
      resolved.resolvedValue = resolveMergeTags(block.mergeTag || '', data);
      break;
  }

  return resolved;
}
