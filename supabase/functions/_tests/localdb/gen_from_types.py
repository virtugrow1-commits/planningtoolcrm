import re, sys
src = open('src/integrations/supabase/types.ts').read()
pub = src[src.index('public: {'):]
tables_block = pub[pub.index('Tables: {'):pub.index('Views: {')]
out = []
for m in re.finditer(r'\n      (\w+): \{\n        Row: \{\n(.*?)\n        \}', tables_block, re.S):
    table, body = m.group(1), m.group(2)
    cols = []
    for line in body.split('\n'):
        mm = re.match(r'\s+(\w+): (.+)$', line.strip() and line)
        if not mm: continue
        name, ts = mm.group(1), mm.group(2).strip()
        nullable = '| null' in ts
        base = ts.replace('| null', '').strip()
        if base.startswith('Json'): t = 'jsonb'
        elif base == 'string[]': t = 'text[]'
        elif base == 'number': t = 'numeric'
        elif base == 'boolean': t = 'boolean'
        elif base == 'string':
            if name == 'id' or (name.endswith('_id') and not name.startswith('ghl_') and name not in ('external_id','kvk_id','location_id','eboekhouden_id','calendar_id','conversation_id_ext','message_id','document_id','request_id','project_id')): t = 'uuid'
            elif name.endswith('_at') or name in ('created_at','updated_at'): t = 'timestamptz'
            elif name in ('date','due_date','preferred_date','birth_date','valid_until','issue_date','invoice_date','option_expires_at'): t = 'date'
            elif name in ('preferred_start_time','preferred_end_time','due_time'): t = 'time'
            else: t = 'text'
        else: t = 'text'
        if name in ('start_hour','end_hour','start_minute','end_minute','guest_count','retry_count','max_retries','offerte_revisie','sort_order','offset_days','max_guests'): t = 'integer' if t == 'numeric' else t
        default = ''
        if name == 'id' and t == 'uuid': default = ' DEFAULT gen_random_uuid()'
        elif name in ('created_at','updated_at'): default = ' DEFAULT now()'
        elif not nullable and t == 'boolean': default = ' DEFAULT false'
        elif not nullable and t in ('numeric','integer'): default = ' DEFAULT 0'
        elif not nullable and t == 'text[]': default = " DEFAULT '{}'"
        elif not nullable and t == 'jsonb': default = " DEFAULT '{}'::jsonb"
        cols.append((name, t, nullable, default))
    out.append(f'CREATE TABLE IF NOT EXISTS public.{table} (' + ', '.join(f'{n} {t}{" PRIMARY KEY" if n=="id" else ""}{d}' for n,t,nl,d in cols) + ');')
    for n,t,nl,d in cols:
        out.append(f'ALTER TABLE public.{table} ADD COLUMN IF NOT EXISTS {n} {t}{d};')
    out.append(f'ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY;')
print('\n'.join(out))

# Foreign keys from the Relationships arrays (generated from the live DB)
fk_out = []
starts = [(mm.start(), mm.group(1)) for mm in re.finditer(r'\n      (\w+): \{\n        Row: \{', tables_block)]
for i, (pos, table) in enumerate(starts):
    section = tables_block[pos: starts[i + 1][0] if i + 1 < len(starts) else len(tables_block)]
    for r in re.finditer(r'foreignKeyName: "([^"]+)"\s+columns: \["([^"]+)"\]\s+isOneToOne: \w+\s+referencedRelation: "([^"]+)"\s+referencedColumns: \["([^"]+)"\]', section):
        name, col, ref, refcol = r.groups()
        fk_out.append(f'DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = \'{name}\') THEN ALTER TABLE public.{table} ADD CONSTRAINT {name} FOREIGN KEY ({col}) REFERENCES public.{ref}({refcol}) ON DELETE SET NULL NOT VALID; END IF; EXCEPTION WHEN others THEN RAISE NOTICE \'fk {name}: %\', SQLERRM; END $$;')
open(__import__('os').path.join(__import__('os').path.dirname(__file__), '20_fks_from_types.sql'), 'w').write('\n'.join(fk_out))
