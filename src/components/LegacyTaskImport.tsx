import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, CheckCircle2, AlertCircle, Loader2, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

// Robust semicolon-CSV parser supporting quoted fields with embedded ; and newlines
function parseSemicolonCSV(text: string): Record<string, string>[] {
  // Strip BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ';') { cur.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        cur.push(field); field = '';
        if (cur.length > 1 || cur[0] !== '') rows.push(cur);
        cur = [];
      } else {
        field += c;
      }
    }
  }
  if (field !== '' || cur.length) { cur.push(field); rows.push(cur); }
  if (rows.length < 2) return [];

  const headers = rows[0].map(h => h.trim().toLowerCase());
  const result: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      const v = rows[r][idx];
      row[h] = (v === undefined || v === 'NULL') ? '' : v.trim();
    });
    result.push(row);
  }
  return result;
}

const norm = (s?: string) => (s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

interface ImportResult {
  totalProcessed: number;
  inserted: number;
  skippedDuplicate: number;
  failed: number;
  linkedToContact: number;
  linkedToCompany: number;
  unlinked: number;
}

export default function LegacyTaskImport() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);

  const tasksRef = useRef<HTMLInputElement>(null);
  const contactsRef = useRef<HTMLInputElement>(null);
  const contactDataRef = useRef<HTMLInputElement>(null);
  const customersRef = useRef<HTMLInputElement>(null);
  const customerDataRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<{
    tasks?: File;
    contacts?: File;
    contactData?: File;
    customers?: File;
    customerData?: File;
  }>({});

  const readFile = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file, 'UTF-8');
  });

  const fetchAllPaginated = async (table: 'contacts' | 'companies' | 'tasks', columns: string) => {
    const all: any[] = [];
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await (supabase as any).from(table).select(columns).range(from, from + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return all;
  };

  const startImport = async () => {
    if (!user) return;
    if (!files.tasks || !files.contacts || !files.contactData || !files.customers || !files.customerData) {
      toast({ title: 'Bestanden ontbreken', description: 'Upload alle 5 CSV-bestanden.', variant: 'destructive' });
      return;
    }

    setImporting(true);
    setProgress(0);
    setResult(null);
    const stats: ImportResult = {
      totalProcessed: 0, inserted: 0, skippedDuplicate: 0, failed: 0,
      linkedToContact: 0, linkedToCompany: 0, unlinked: 0,
    };

    try {
      // ---- 1. Read files
      setStatus('CSV-bestanden inlezen...');
      const [tasksTxt, contactsTxt, contactDataTxt, customersTxt, customerDataTxt] = await Promise.all([
        readFile(files.tasks), readFile(files.contacts), readFile(files.contactData),
        readFile(files.customers), readFile(files.customerData),
      ]);

      const tasksRows = parseSemicolonCSV(tasksTxt);
      const contactsRows = parseSemicolonCSV(contactsTxt);
      const contactDataRows = parseSemicolonCSV(contactDataTxt);
      const customersRows = parseSemicolonCSV(customersTxt);
      const customerDataRows = parseSemicolonCSV(customerDataTxt);

      setStatus(`Geladen: ${tasksRows.length} taken, ${contactsRows.length} contacten, ${customersRows.length} klanten`);

      // ---- 2. Reconstruct EAV data for contacts
      // contacts_1.csv: id, customer_id, ... (basic) — enrich via contact_data_1.csv (id/contact_id, key, value)
      const contactById = new Map<string, { firstName: string; lastName: string; email: string; customerId: string }>();
      for (const c of contactsRows) {
        const id = c['id'] || c['contact_id'];
        if (!id) continue;
        contactById.set(id, {
          firstName: c['voornaam'] || c['first_name'] || c['firstname'] || '',
          lastName: c['achternaam'] || c['last_name'] || c['lastname'] || '',
          email: c['email'] || c['e-mail'] || '',
          customerId: c['customer_id'] || c['klant_id'] || '',
        });
      }
      // EAV merge
      for (const d of contactDataRows) {
        const cid = d['contact_id'] || d['id'];
        const key = (d['key'] || d['veld'] || d['field'] || '').toLowerCase();
        const val = d['value'] || d['waarde'] || '';
        if (!cid || !key || !val) continue;
        const rec = contactById.get(cid) || { firstName: '', lastName: '', email: '', customerId: '' };
        if (key.includes('voornaam') || key === 'first_name' || key === 'firstname') rec.firstName ||= val;
        else if (key.includes('achternaam') || key === 'last_name' || key === 'lastname') rec.lastName ||= val;
        else if (key.includes('email') || key.includes('e-mail') || key.includes('mail')) rec.email ||= val;
        contactById.set(cid, rec);
      }

      // ---- 3. Reconstruct customers
      const customerById = new Map<string, { name: string; email: string }>();
      for (const c of customersRows) {
        const id = c['id'] || c['customer_id'];
        if (!id) continue;
        const name = c['bedrijfsnaam'] || c['company_name'] || c['naam'] || c['name'] || '';
        customerById.set(id, { name, email: c['email'] || '' });
      }
      for (const d of customerDataRows) {
        const cid = d['customer_id'] || d['id'];
        const key = (d['key'] || d['veld'] || d['field'] || '').toLowerCase();
        const val = d['value'] || d['waarde'] || '';
        if (!cid || !key || !val) continue;
        const rec = customerById.get(cid) || { name: '', email: '' };
        if (key.includes('bedrijf') || key.includes('company') || key === 'naam' || key === 'name') rec.name ||= val;
        else if (key.includes('email') || key.includes('mail')) rec.email ||= val;
        customerById.set(cid, rec);
      }

      // ---- 4. Load CRM contacts + companies
      setStatus('CRM-contacten en bedrijven ophalen...');
      const [crmContacts, crmCompanies, existingTasks] = await Promise.all([
        fetchAllPaginated('contacts', 'id, first_name, last_name, email'),
        fetchAllPaginated('companies', 'id, name, email'),
        fetchAllPaginated('tasks', 'legacy_task_id'),
      ]);

      const existingLegacyIds = new Set<number>(
        existingTasks.map((t: any) => t.legacy_task_id).filter((x: any) => x !== null && x !== undefined)
      );

      // Build CRM lookup maps
      const crmContactByEmail = new Map<string, string>();
      const crmContactByName = new Map<string, string>();
      for (const c of crmContacts) {
        if (c.email) crmContactByEmail.set(norm(c.email), c.id);
        const fullName = norm(`${c.first_name || ''} ${c.last_name || ''}`);
        if (fullName) crmContactByName.set(fullName, c.id);
      }
      const crmCompanyByEmail = new Map<string, string>();
      const crmCompanyByName = new Map<string, string>();
      for (const c of crmCompanies) {
        if (c.email) crmCompanyByEmail.set(norm(c.email), c.id);
        if (c.name) crmCompanyByName.set(norm(c.name), c.id);
      }

      // ---- 5. Build legacy → CRM maps
      const legacyContactToCrm = new Map<string, string>();
      for (const [legacyId, info] of contactById.entries()) {
        let crmId: string | undefined;
        if (info.email) crmId = crmContactByEmail.get(norm(info.email));
        if (!crmId) {
          const full = norm(`${info.firstName} ${info.lastName}`);
          if (full) crmId = crmContactByName.get(full);
        }
        if (crmId) legacyContactToCrm.set(legacyId, crmId);
      }
      const legacyCustomerToCompany = new Map<string, string>();
      for (const [legacyId, info] of customerById.entries()) {
        let crmId: string | undefined;
        if (info.email) crmId = crmCompanyByEmail.get(norm(info.email));
        if (!crmId && info.name) crmId = crmCompanyByName.get(norm(info.name));
        if (crmId) legacyCustomerToCompany.set(legacyId, crmId);
      }

      setStatus(`Mappings: ${legacyContactToCrm.size} contacten, ${legacyCustomerToCompany.size} bedrijven gekoppeld`);

      // ---- 6. Build task rows
      const accountIdToName: Record<string, string> = { '4': 'Iris Machielse', '6': 'Sjors Jochems' };
      const taskRowsToInsert: any[] = [];

      for (const t of tasksRows) {
        const legacyId = parseInt(t['id'] || '0', 10);
        if (!legacyId) continue;
        if (existingLegacyIds.has(legacyId)) {
          stats.skippedDuplicate++;
          continue;
        }

        const title = t['titel'] || t['title'] || t['name'] || '(geen titel)';
        const description = t['notitie'] || t['note'] || t['description'] || null;
        const dueDate = t['datum'] || t['date'] || t['due_date'] || null;
        const csvStatus = t['status'] || '0';
        const isCompleted = csvStatus === '1' || csvStatus.toLowerCase() === 'completed';
        const startedAt = t['started_at'] || t['completed_at'] || '';
        const accountId = t['account_id'] || t['user_id'] || '';
        const legacyContactId = t['contact_id'] || '';
        const legacyCustomerId = t['customer_id'] || '';

        const crmContactId = legacyContactId ? legacyContactToCrm.get(legacyContactId) : undefined;
        const crmCompanyId = legacyCustomerId ? legacyCustomerToCompany.get(legacyCustomerId) : undefined;

        if (crmContactId) stats.linkedToContact++;
        if (crmCompanyId) stats.linkedToCompany++;
        if (!crmContactId && !crmCompanyId) stats.unlinked++;

        taskRowsToInsert.push({
          user_id: user.id,
          title: title.substring(0, 500),
          description: description || null,
          status: isCompleted ? 'completed' : 'open',
          priority: 'normal',
          due_date: dueDate || null,
          assigned_to: accountIdToName[accountId] || null,
          contact_id: crmContactId || null,
          company_id: crmCompanyId || null,
          completed_at: isCompleted ? (startedAt || new Date().toISOString()) : null,
          legacy_task_id: legacyId,
        });
      }

      stats.totalProcessed = tasksRows.length;
      setStatus(`${taskRowsToInsert.length} nieuwe taken klaar voor import...`);

      // ---- 7. Insert in batches
      const BATCH = 100;
      for (let i = 0; i < taskRowsToInsert.length; i += BATCH) {
        const batch = taskRowsToInsert.slice(i, i + BATCH);
        const { error } = await (supabase as any).from('tasks').insert(batch);
        if (error) {
          // Try one-by-one to skip failing rows
          for (const row of batch) {
            const { error: e2 } = await (supabase as any).from('tasks').insert(row);
            if (e2) stats.failed++;
            else stats.inserted++;
          }
        } else {
          stats.inserted += batch.length;
        }
        const pct = Math.round(((i + batch.length) / Math.max(taskRowsToInsert.length, 1)) * 100);
        setProgress(pct);
        setStatus(`Geïmporteerd: ${Math.min(i + BATCH, taskRowsToInsert.length)} / ${taskRowsToInsert.length}`);
      }

      setProgress(100);
      setResult(stats);
      toast({ title: 'Import voltooid', description: `${stats.inserted} nieuwe taken toegevoegd.` });
    } catch (err: any) {
      console.error('[LegacyTaskImport]', err);
      toast({ title: 'Importfout', description: err.message || 'Onbekende fout', variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  const fileSlot = (
    label: string,
    key: keyof typeof files,
    ref: React.RefObject<HTMLInputElement>,
    description: string,
  ) => (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      <FileText size={18} className="text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground truncate">{files[key]?.name || description}</p>
      </div>
      <input
        ref={ref}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setFiles((p) => ({ ...p, [key]: f }));
        }}
      />
      <Button size="sm" variant="outline" onClick={() => ref.current?.click()} disabled={importing}>
        {files[key] ? <CheckCircle2 size={14} className="text-success" /> : <Upload size={14} />}
      </Button>
    </div>
  );

  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        <div>
          <h3 className="text-base font-semibold text-foreground">Taken importeren uit oud CRM</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Importeert taken uit het vorige CRM-systeem en koppelt deze automatisch aan bestaande contactpersonen
            en bedrijven op basis van naam en e-mailadres. Eerder geïmporteerde taken worden overgeslagen.
          </p>
        </div>

        <div className="space-y-2">
          {fileSlot('tasks-3.csv', 'tasks', tasksRef, 'De takenlijst zelf')}
          {fileSlot('contacts_1.csv', 'contacts', contactsRef, 'Mapping legacy contact_id → naam')}
          {fileSlot('contact_data_1.csv', 'contactData', contactDataRef, 'EAV-velden van contacten')}
          {fileSlot('customers_2.csv', 'customers', customersRef, 'Mapping legacy customer_id → bedrijf')}
          {fileSlot('customer_data_1.csv', 'customerData', customerDataRef, 'EAV-velden van klanten')}
        </div>

        {importing && (
          <div className="space-y-2">
            <Progress value={progress} />
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 size={12} className="animate-spin" /> {status}
            </p>
          </div>
        )}

        {result && (
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2 text-sm">
            <p className="font-medium text-foreground flex items-center gap-2">
              <CheckCircle2 size={16} className="text-success" /> Importresultaat
            </p>
            <ul className="text-muted-foreground space-y-1 pl-1">
              <li>Totaal verwerkt: <strong className="text-foreground">{result.totalProcessed}</strong></li>
              <li>Nieuw aangemaakt: <strong className="text-foreground">{result.inserted}</strong></li>
              <li>Overgeslagen (al aanwezig): <strong className="text-foreground">{result.skippedDuplicate}</strong></li>
              <li>Mislukt: <strong className="text-foreground">{result.failed}</strong></li>
              <li>Gekoppeld aan contact: <strong className="text-foreground">{result.linkedToContact}</strong></li>
              <li>Gekoppeld aan bedrijf: <strong className="text-foreground">{result.linkedToCompany}</strong></li>
              <li>Zonder koppeling (handmatig op te lossen): <strong className="text-foreground">{result.unlinked}</strong></li>
            </ul>
          </div>
        )}

        {!result && !importing && (
          <div className="rounded-lg bg-info/10 border border-info/20 p-3 text-xs text-foreground flex items-start gap-2">
            <AlertCircle size={14} className="text-info shrink-0 mt-0.5" />
            <span>De import duurt enkele minuten voor ~2200 taken. Sluit dit tabblad niet tijdens de import.</span>
          </div>
        )}

        <Button onClick={startImport} disabled={importing} className="w-full">
          {importing ? <><Loader2 size={14} className="mr-2 animate-spin" /> Bezig met importeren...</> : 'Start import'}
        </Button>
      </CardContent>
    </Card>
  );
}
