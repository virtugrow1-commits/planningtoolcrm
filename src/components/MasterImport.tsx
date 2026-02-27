import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Upload, CheckCircle2, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';

interface ImportResult {
  companiesCreated: number;
  contactsCreated: number;
  linked: number;
  errors: string[];
}

interface ParsedCompany {
  name: string;
  oldId: string;
}

interface ParsedContact {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  function_title: string | null;
  department: string | null;
  companyOldId: string | null; // null = Persoon
  customerName: string; // for reference
}

function splitPipe(val: string | undefined): string[] {
  if (!val) return [];
  return val.split(/\s*\|\s*/).map(s => s.trim()).filter(Boolean);
}

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return { first: parts[0] || '—', last: '—' };
  // Common Dutch prefixes
  const prefixes = ['van', 'de', 'den', 'der', 'het', 'ten', 'ter', 'op', "'t", 'in', 'het'];
  let splitIdx = 1;
  for (let i = 1; i < parts.length; i++) {
    if (prefixes.includes(parts[i].toLowerCase())) {
      splitIdx = i;
      break;
    }
    if (i === 1) splitIdx = 1;
  }
  return {
    first: parts.slice(0, splitIdx).join(' ') || '—',
    last: parts.slice(splitIdx).join(' ') || '—',
  };
}

function cleanPhone(phone: string | undefined): string | null {
  if (!phone) return null;
  const cleaned = phone.trim();
  return cleaned || null;
}

export default function MasterImport() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [syncingGHL, setSyncingGHL] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImport = async () => {
    if (!file || !user) return;
    setImporting(true);
    setProgress(0);
    setResult(null);

    try {
      // Step 1: Parse XLSX
      setStatus('Excel bestand inlezen...');
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      setProgress(10);

      // Step 2: Parse into companies & contacts
      setStatus(`${rows.length} rijen verwerken...`);
      const companies: ParsedCompany[] = [];
      const contacts: ParsedContact[] = [];
      const companyNames = new Set<string>();

      for (const row of rows) {
        const type = String(row.klant_type || '').trim();
        const name = String(row.klant_of_bedrijf || '').trim();
        const oldId = String(row.customer_id || '');
        
        if (!name || name === 'Naam niet bepaald' || name === '0') continue;

        const contactPersons = splitPipe(String(row.contactpersonen || ''));
        const emails = splitPipe(String(row.emails || ''));
        const phones = splitPipe(String(row.telefoon || ''));
        const mobiles = splitPipe(String(row.mobiel || ''));
        const functions = splitPipe(String(row.functies || ''));
        const departments = splitPipe(String(row.afdelingen || ''));

        if (type === 'Bedrijf') {
          // Create company
          const nameKey = name.toLowerCase().trim();
          if (!companyNames.has(nameKey)) {
            companies.push({ name, oldId });
            companyNames.add(nameKey);
          }

          // Create contacts for each contact person
          if (contactPersons.length > 0) {
            for (let i = 0; i < contactPersons.length; i++) {
              const cpName = contactPersons[i];
              if (!cpName || cpName === '...' || cpName.toLowerCase().includes('financiële administratie')) continue;
              const { first, last } = splitName(cpName);
              contacts.push({
                firstName: first,
                lastName: last,
                email: emails[i] ? emails[i].replace(/\\@/g, '@') : null,
                phone: cleanPhone(phones[i]),
                mobile: cleanPhone(mobiles[i]),
                function_title: functions[i] || null,
                department: departments[i] || null,
                companyOldId: oldId,
                customerName: name,
              });
            }
          }
        } else if (type === 'Persoon') {
          // Create contacts directly
          if (contactPersons.length > 0) {
            for (let i = 0; i < contactPersons.length; i++) {
              const cpName = contactPersons[i];
              if (!cpName || cpName === '...') continue;
              const { first, last } = splitName(cpName);
              contacts.push({
                firstName: first,
                lastName: last,
                email: emails[i] ? emails[i].replace(/\\@/g, '@') : (i === 0 && emails[0] ? emails[0].replace(/\\@/g, '@') : null),
                phone: cleanPhone(phones[i]) || (i === 0 ? cleanPhone(phones[0]) : null),
                mobile: cleanPhone(mobiles[i]) || (i === 0 ? cleanPhone(mobiles[0]) : null),
                function_title: functions[i] || null,
                department: departments[i] || null,
                companyOldId: null, // Persoon = no company
                customerName: name,
              });
            }
          } else {
            // No contactpersonen listed, use klant_of_bedrijf as name
            const { first, last } = splitName(name);
            contacts.push({
              firstName: first,
              lastName: last,
              email: emails[0] ? emails[0].replace(/\\@/g, '@') : null,
              phone: cleanPhone(phones[0]),
              mobile: cleanPhone(mobiles[0]),
              function_title: null,
              department: null,
              companyOldId: null,
              customerName: name,
            });
          }
        }
      }

      setProgress(20);
      setStatus(`Gevonden: ${companies.length} bedrijven, ${contacts.length} contactpersonen`);

      // Step 3: Clear existing data
      setStatus('Bestaande contacten en bedrijven verwijderen...');
      // Order matters: contact_companies → contacts → companies (FK constraints)
      await supabase.from('contact_companies').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      setProgress(25);
      await supabase.from('contacts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      setProgress(30);
      await supabase.from('companies').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      setProgress(35);

      // Step 4: Insert companies
      setStatus(`${companies.length} bedrijven invoegen...`);
      const companyNameToId: Record<string, string> = {};
      const oldIdToCompanyId: Record<string, string> = {};
      let companiesCreated = 0;

      for (let i = 0; i < companies.length; i += 50) {
        const batch = companies.slice(i, i + 50);
        const insertBatch = batch.map(c => ({
          user_id: user.id,
          name: c.name,
        }));

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
            companyNameToId[inserted[j].name.toLowerCase().trim()] = inserted[j].id;
            oldIdToCompanyId[batch[j].oldId] = inserted[j].id;
            companiesCreated++;
          }
        }
        setProgress(35 + Math.round((i / companies.length) * 20));
      }

      setProgress(55);

      // Step 5: Insert contacts
      setStatus(`${contacts.length} contactpersonen invoegen...`);
      let contactsCreated = 0;
      let linked = 0;
      const errors: string[] = [];

      // Deduplicate contacts by email
      const seenEmails = new Set<string>();

      for (let i = 0; i < contacts.length; i += 50) {
        const batch = contacts.slice(i, i + 50);
        const insertBatch: any[] = [];

        for (const c of batch) {
          // Skip if we've already seen this email
          if (c.email) {
            const emailKey = c.email.toLowerCase().trim();
            if (seenEmails.has(emailKey)) continue;
            seenEmails.add(emailKey);
          }

          const companyId = c.companyOldId ? oldIdToCompanyId[c.companyOldId] : null;
          const companyName = c.companyOldId ? c.customerName : null;
          const notes = [
            c.function_title ? `Functie: ${c.function_title}` : '',
            c.department ? `Afdeling: ${c.department}` : '',
          ].filter(Boolean).join('\n') || null;

          insertBatch.push({
            user_id: user.id,
            first_name: c.firstName,
            last_name: c.lastName,
            email: c.email || null,
            phone: c.phone || c.mobile || null,
            company: companyName || null,
            company_id: companyId || null,
            status: 'lead',
            notes,
          });

          if (companyId) linked++;
        }

        if (insertBatch.length === 0) continue;

        const { error } = await supabase.from('contacts').insert(insertBatch as any);
        if (error) {
          console.error('Contact insert error at batch', i, error);
          errors.push(`Batch ${i}: ${error.message}`);
        } else {
          contactsCreated += insertBatch.length;
        }
        setProgress(55 + Math.round((i / contacts.length) * 40));
      }

      setProgress(100);
      setStatus('Import voltooid!');
      setResult({ companiesCreated, contactsCreated, linked, errors });

      toast({
        title: '✅ Master import voltooid',
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

  const handleGHLSync = async () => {
    setSyncingGHL(true);
    try {
      // Run full sync to match imported contacts with GHL
      const results: string[] = [];

      // 1. Contacts sync (paginated)
      let totalContacts = 0;
      let nextPageUrl: string | null = null;
      let hasMore = true;
      while (hasMore) {
        const body: any = { action: 'sync-contacts' };
        if (nextPageUrl) body.nextPageUrl = nextPageUrl;
        const { data, error } = await supabase.functions.invoke('ghl-sync', { body });
        if (error) break;
        totalContacts += data?.synced || 0;
        nextPageUrl = data?.nextPageUrl || null;
        hasMore = !!data?.hasMore;
        if (hasMore) await new Promise(r => setTimeout(r, 1000));
      }
      results.push(`${totalContacts} contacten`);

      // 2. Companies
      await new Promise(r => setTimeout(r, 1500));
      try {
        const { data } = await supabase.functions.invoke('ghl-sync', { body: { action: 'sync-companies' } });
        results.push(`${data?.synced || 0} bedrijven`);
      } catch {}

      toast({
        title: '✅ GHL Sync voltooid',
        description: `Gematcht: ${results.join(', ')}`,
      });
    } catch (err: any) {
      toast({ title: 'Sync mislukt', description: err.message, variant: 'destructive' });
    } finally {
      setSyncingGHL(false);
    }
  };

  return (
    <div className="rounded-xl border bg-card p-6 card-shadow space-y-5">
      <div>
        <h3 className="font-semibold text-card-foreground">Master CRM Import</h3>
        <p className="text-xs text-muted-foreground">
          Importeer het complete CRM Master Overzicht (.xlsx). Bestaande contacten en bedrijven worden eerst verwijderd.
        </p>
      </div>

      <div className="rounded-lg border-2 border-dashed p-4 cursor-pointer hover:border-primary/50 transition-colors"
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => { if (e.target.files?.[0]) setFile(e.target.files[0]); }}
        />
        {file ? (
          <div className="flex items-center gap-2 text-sm text-foreground">
            <CheckCircle2 size={16} className="text-success" />
            <span className="font-medium">{file.name}</span>
            <span className="text-muted-foreground text-xs">({(file.size / 1024).toFixed(0)} KB)</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Upload size={16} />
            <span>Klik om CRM_master_overzicht.xlsx te uploaden</span>
          </div>
        )}
      </div>

      {!importing && !result && file && (
        <div className="rounded-lg border border-warning/50 bg-warning/10 p-3 flex items-start gap-2">
          <AlertTriangle size={16} className="text-warning mt-0.5 shrink-0" />
          <div className="text-xs text-warning">
            <p className="font-semibold">Let op!</p>
            <p>Alle bestaande contacten en bedrijven worden verwijderd en vervangen door de data uit dit bestand. Aanvragen, reserveringen en taken blijven behouden.</p>
          </div>
        </div>
      )}

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
        <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <CheckCircle2 size={16} className="text-success" /> Import resultaat
          </div>
          <p className="text-muted-foreground">Bedrijven: <strong>{result.companiesCreated}</strong> aangemaakt</p>
          <p className="text-muted-foreground">Contacten: <strong>{result.contactsCreated}</strong> aangemaakt</p>
          <p className="text-muted-foreground">Gekoppeld aan bedrijf: <strong>{result.linked}</strong></p>
          {result.errors.length > 0 && (
            <div className="text-xs text-destructive mt-1">
              {result.errors.length} fout(en) — bekijk de console voor details
            </div>
          )}

          <div className="pt-3 border-t mt-3">
            <p className="text-xs text-muted-foreground mb-2">
              Stap 2: Synchroniseer met VirtuGrow om de juiste GHL-koppelingen te leggen.
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={syncingGHL}
              onClick={handleGHLSync}
            >
              {syncingGHL ? (
                <><Loader2 size={14} className="mr-1.5 animate-spin" /> Synchroniseren...</>
              ) : (
                <><RefreshCw size={14} className="mr-1.5" /> GHL Koppeling Uitvoeren</>
              )}
            </Button>
          </div>
        </div>
      )}

      <Button
        onClick={handleImport}
        disabled={importing || !file}
      >
        {importing ? (
          <><Loader2 size={14} className="mr-1.5 animate-spin" /> Importeren...</>
        ) : (
          <><Upload size={14} className="mr-1.5" /> Master Import Starten</>
        )}
      </Button>
    </div>
  );
}
