// Shared helper: normalise a GoHighLevel task title into a "task type" key so
// repeated automated tasks ("Factuur sturen - Jan Jansen") group under one rule
// ("factuur sturen") that can be switched on or off in the settings.
export function taskRuleKey(title: string): string {
  let t = (title || '').trim();
  // Strip a trailing " - <person or company name>" suffix that GHL appends.
  t = t.replace(/\s+[-–—]\s+[^-–—]{2,}$/u, '');
  return t
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Human readable default label for a rule key. */
export function taskRuleLabel(title: string): string {
  const t = (title || '').trim().replace(/\s+[-–—]\s+[^-–—]{2,}$/u, '').replace(/\s+/g, ' ').trim();
  return t || 'Onbekende taak';
}

export interface SuppressionRow {
  ghl_task_id: string;
  reason: string;
  kept_task_id?: string | null;
  match_key?: string | null;
}

/** Record an ignored GHL task so it is not re-created on the next sync. */
export async function suppressGhlTask(supabase: any, row: SuppressionRow): Promise<void> {
  await supabase.from('ghl_task_suppressions').upsert(row, { onConflict: 'ghl_task_id' });
}
