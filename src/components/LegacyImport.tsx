import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Upload, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

// Parse semicolon-delimited CSV with quoted fields
function parseSemicolonCSV(text: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return rows;

  // Parse header
  const headers = lines[0].split(';').map(h => h.replace(/^"|"$/g, '').trim());

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = line.split(';').map(v => v.replace(/^"|"$/g, '').trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] === 'NULL' ? '' : (values[idx] || '');
    });
    rows.push(row);
  }
  return rows;
}

interface ImportResult {
  companiesCreated: number;
  companiesSkipped: number;
  contactsCreated: number;
  contactsSkipped: number;
  linked: number;
}

export default function LegacyImport() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);

  const customersRef = useRef<HTMLInputElement>(null);
  const customerDataRef = useRef<HTMLInputElement>(null);
  const contactsRef = useRef<HTMLInputElement>(null);
  const contactDataRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<{
    customers?: File;
    customerData?: File;
    contacts?: File;
    contactData?: File;
  }>({});

  const readFile = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsText(file, 'utf-8');
    });

  const handleImport = async () => {
    if (!files.customers || !files.customerData || !files.contacts || !files.contactData) {
      toast({ title: 'Upload alle 4 bestanden', variant: 'destructive' });
      return;
    }
    if (!user) return;

    setImporting(true);
    setProgress(0);
    setResult(null);

    try {
      // Step 1: Parse all CSVs
      setStatus('Bestanden inlezen...');
      const [customersText, customerDataText, contactsText, contactDataText] = await Promise.all([
        readFile(files.customers),
        readFile(files.customerData),
        readFile(files.contacts),
        readFile(files.contactData),
      ]);

      const customersRows = parseSemicolonCSV(customersText);
      const customerDataRows = parseSemicolonCSV(customerDataText);
      const contactsRows = parseSemicolonCSV(contactsText);
      const contactDataRows = parseSemicolonCSV(contactDataText);

      setProgress(10);

      // Step 2: Build customer data lookup (EAV → flat)
      setStatus('Data transformeren...');
      const customerFields: Record<string, Record<string, string>> = {};
      for (const row of customerDataRows) {
        const cid = row.customer_id;
        if (!cid) continue;
        if (!customerFields[cid]) customerFields[cid] = {};
        customerFields[cid][row.field_id] = row.value || '';
      }

      // Build contact data lookup
      const contactFields: Record<string, Record<string, string>> = {};
      for (const row of contactDataRows) {
        const cid = row.contact_id;
        if (!cid) continue;
        if (!contactFields[cid]) contactFields[cid] = {};
        contactFields[cid][row.field_id] = row.value || '';
      }

      // Build contact→customer mapping
      const contactCustomerMap: Record<string, string> = {};
      for (const row of contactsRows) {
        contactCustomerMap[row.id] = row.customer_id;
      }

      setProgress(20);

      // Step 3: Get existing data for duplicate check
      setStatus('Bestaande data ophalen voor duplicaat-check...');
      const { data: existingCompanies } = await supabase
        .from('companies')
        .select('id, name, email, kvk')
        .order('name');

      const { data: existingContacts } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email')
        .order('first_name');

      const existingCompanyNames = new Set(
        (existingCompanies || []).map(c => c.name?.toLowerCase().trim())
      );
      const existingContactEmails = new Set(
        (existingContacts || []).filter(c => c.email).map(c => c.email!.toLowerCase().trim())
      );

      setProgress(30);

      // Step 4: Insert companies (customer_type = 1)
      setStatus('Bedrijven importeren...');
      const type1Customers = customersRows.filter(c => c.customer_type === '1');
      const oldCompanyIdToNewId: Record<string, string> = {};
      let companiesCreated = 0;
      let companiesSkipped = 0;

      // Match existing companies by name for linking
      const companyNameToId: Record<string, string> = {};
      for (const c of (existingCompanies || [])) {
        if (c.name) companyNameToId[c.name.toLowerCase().trim()] = c.id;
      }

      const companyBatch: any[] = [];
      for (const cust of type1Customers) {
        const fields = customerFields[cust.id] || {};
        const name = (fields['1'] || '').trim();
        if (!name) continue;

        const nameKey = name.toLowerCase().trim();
        if (existingCompanyNames.has(nameKey)) {
          // Already exists — map old ID to existing
          const existingId = companyNameToId[nameKey];
          if (existingId) oldCompanyIdToNewId[cust.id] = existingId;
          companiesSkipped++;
          continue;
        }

        companyBatch.push({
          user_id: user.id,
          name,
          kvk: fields['2'] || null,
          address: fields['3'] || null,
          postcode: fields['4'] || null,
          city: fields['5'] || null,
          country: fields['6'] || 'NL',
          customer_number: fields['117'] || null,
          phone: fields['118'] || null,
          email: fields['119'] || null,
          website: fields['120'] || null,
          btw_number: fields['121'] || null,
          notes: fields['141'] || null,
          _old_id: cust.id, // temporary, stripped before insert
        });
        existingCompanyNames.add(nameKey);
      }

      // Insert companies in batches of 50
      for (let i = 0; i < companyBatch.length; i += 50) {
        const batch = companyBatch.slice(i, i + 50);
        const insertBatch = batch.map(({ _old_id, ...rest }) => rest);
        const { data: inserted, error } = await (supabase as any)
          .from('companies')
          .insert(insertBatch)
          .select('id, name');

        if (error) {
          console.error('Company insert error:', error);
          continue;
        }

        if (inserted) {
          for (let j = 0; j < inserted.length; j++) {
            const oldId = batch[j]._old_id;
            oldCompanyIdToNewId[oldId] = inserted[j].id;
            companyNameToId[inserted[j].name.toLowerCase().trim()] = inserted[j].id;
            companiesCreated++;
          }
        }

        setProgress(30 + Math.round((i / companyBatch.length) * 20));
      }

      setProgress(50);

      // Step 5: Insert contacts from contact records (type 5)
      setStatus('Contactpersonen importeren...');
      let contactsCreated = 0;
      let contactsSkipped = 0;
      let linked = 0;

      const contactBatch: any[] = [];
      for (const contactRow of contactsRows) {
        const fields = contactFields[contactRow.id] || {};
        const firstName = (fields['63'] || '').trim();
        const tussenvoegsel = (fields['64'] || '').trim();
        const lastName = [tussenvoegsel, (fields['65'] || '').trim()].filter(Boolean).join(' ');

        if (!firstName && !lastName) continue;

        const email = (fields['68'] || '').trim().toLowerCase();
        if (email && existingContactEmails.has(email)) {
          contactsSkipped++;
          continue;
        }

        // Find company link
        const customerId = contactRow.customer_id;
        const companyNewId = oldCompanyIdToNewId[customerId];
        let companyName: string | null = null;
        if (companyNewId) {
          const companyEntry = Object.entries(companyNameToId).find(([, id]) => id === companyNewId);
          if (companyEntry) companyName = companyEntry[0];
        }

        const notes = [fields['127'], fields['128'] ? `Functie: ${fields['128']}` : ''].filter(Boolean).join('\n');

        contactBatch.push({
          user_id: user.id,
          first_name: firstName || '—',
          last_name: lastName || '—',
          email: email || null,
          phone: fields['67'] || null,
          company: companyName ? companyName.split('').map((c, i) => i === 0 ? c.toUpperCase() : c).join('') : null,
          company_id: companyNewId || null,
          status: 'lead',
          notes: notes || null,
        });

        if (email) existingContactEmails.add(email);
        if (companyNewId) linked++;
      }

      setProgress(60);

      // Step 6: Also import type 2 customers (individuals) as contacts
      setStatus('Particulieren importeren...');
      const type2Customers = customersRows.filter(c => c.customer_type === '2');
      for (const cust of type2Customers) {
        const fields = customerFields[cust.id] || {};
        const fullName = (fields['7'] || '').trim();
        if (!fullName) continue;

        const email = (fields['12'] || '').trim().toLowerCase();
        if (email && existingContactEmails.has(email)) {
          contactsSkipped++;
          continue;
        }

        // Split full name into first/last
        const nameParts = fullName.split(/\s+/);
        const firstName = nameParts[0] || '—';
        const lastName = nameParts.slice(1).join(' ') || '—';

        const isClient = fields['116'] === 'ja';

        contactBatch.push({
          user_id: user.id,
          first_name: firstName,
          last_name: lastName,
          email: email || null,
          phone: fields['11'] || null,
          company: null,
          company_id: null,
          status: isClient ? 'client' : 'lead',
          notes: null,
        });

        if (email) existingContactEmails.add(email);
      }

      setProgress(70);

      // Step 7: Batch insert contacts
      setStatus(`${contactBatch.length} contactpersonen inserteren...`);
      for (let i = 0; i < contactBatch.length; i += 50) {
        const batch = contactBatch.slice(i, i + 50);
        const { error } = await supabase.from('contacts').insert(batch as any);
        if (error) {
          console.error('Contact insert error at batch', i, error);
        } else {
          contactsCreated += batch.length;
        }
        setProgress(70 + Math.round((i / contactBatch.length) * 30));
      }

      setProgress(100);
      setStatus('Import voltooid!');
      setResult({
        companiesCreated,
        companiesSkipped,
        contactsCreated,
        contactsSkipped,
        linked,
      });

      toast({
        title: '✅ Legacy import voltooid',
        description: `${companiesCreated} bedrijven, ${contactsCreated} contacten aangemaakt`,
      });
    } catch (err: any) {
      console.error('Import error:', err);
      toast({ title: 'Import mislukt', description: err.message, variant: 'destructive' });
      setStatus('Fout opgetreden');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="rounded-xl border bg-card p-6 card-shadow space-y-5">
      <div>
        <h3 className="font-semibold text-card-foreground">Legacy CRM Import</h3>
        <p className="text-xs text-muted-foreground">
          Importeer data uit het oude CRM-systeem. Duplicaten worden overgeslagen op basis van naam/email.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FileInput
          label="Customers (customers_2.csv)"
          description="Klanten & bedrijven"
          file={files.customers}
          inputRef={customersRef}
          onSelect={(f) => setFiles(prev => ({ ...prev, customers: f }))}
        />
        <FileInput
          label="Customer Data (customer_data_1.csv)"
          description="Klantgegevens (EAV)"
          file={files.customerData}
          inputRef={customerDataRef}
          onSelect={(f) => setFiles(prev => ({ ...prev, customerData: f }))}
        />
        <FileInput
          label="Contacts (contacts_1.csv)"
          description="Contactpersonen koppelingen"
          file={files.contacts}
          inputRef={contactsRef}
          onSelect={(f) => setFiles(prev => ({ ...prev, contacts: f }))}
        />
        <FileInput
          label="Contact Data (contact_data_1.csv)"
          description="Contactpersoon gegevens (EAV)"
          file={files.contactData}
          inputRef={contactDataRef}
          onSelect={(f) => setFiles(prev => ({ ...prev, contactData: f }))}
        />
      </div>

      {importing && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 size={14} className="animate-spin text-primary" />
            <span className="text-muted-foreground">{status}</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      )}

      {result && (
        <div className="rounded-lg border bg-muted/30 p-4 space-y-1 text-sm">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <CheckCircle2 size={16} className="text-success" /> Import resultaat
          </div>
          <p className="text-muted-foreground">Bedrijven: <strong>{result.companiesCreated}</strong> aangemaakt, {result.companiesSkipped} overgeslagen (duplicaat)</p>
          <p className="text-muted-foreground">Contacten: <strong>{result.contactsCreated}</strong> aangemaakt, {result.contactsSkipped} overgeslagen (duplicaat)</p>
          <p className="text-muted-foreground">Gekoppeld aan bedrijf: <strong>{result.linked}</strong></p>
        </div>
      )}

      <Button
        onClick={handleImport}
        disabled={importing || !files.customers || !files.customerData || !files.contacts || !files.contactData}
      >
        {importing ? (
          <><Loader2 size={14} className="mr-1.5 animate-spin" /> Importeren...</>
        ) : (
          <><Upload size={14} className="mr-1.5" /> Legacy Data Importeren</>
        )}
      </Button>
    </div>
  );
}

function FileInput({ label, description, file, inputRef, onSelect }: {
  label: string;
  description: string;
  file?: File;
  inputRef: React.RefObject<HTMLInputElement>;
  onSelect: (file: File) => void;
}) {
  return (
    <div
      className="rounded-lg border-2 border-dashed p-4 cursor-pointer hover:border-primary/50 transition-colors"
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => { if (e.target.files?.[0]) onSelect(e.target.files[0]); }}
      />
      <Label className="text-xs font-semibold cursor-pointer">{label}</Label>
      <p className="text-[11px] text-muted-foreground">{description}</p>
      {file ? (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-success">
          <CheckCircle2 size={12} /> {file.name}
        </div>
      ) : (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Upload size={12} /> Klik om te uploaden
        </div>
      )}
    </div>
  );
}
