import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Upload, CheckCircle2, Loader2, AlertTriangle, RefreshCw, Building2, Users } from 'lucide-react';
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

/* ── Helpers ────────────────────────────────────────────── */

function normalizeHeader(h: string): string {
  return h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_\s]+/g, ' ').trim();
}

function findCol(row: Record<string, any>, ...candidates: string[]): string {
  for (const c of candidates) {
    if (row[c] !== undefined) return String(row[c] ?? '').trim();
  }
  const normalizedCandidates = candidates.map(normalizeHeader);
  for (const key of Object.keys(row)) {
    const nk = normalizeHeader(key);
    for (const nc of normalizedCandidates) {
      if (nk === nc || nk.includes(nc) || nc.includes(nk)) {
        return String(row[key] ?? '').trim();
      }
    }
  }
  return '';
}

function splitPipe(val: string | undefined): string[] {
  if (!val) return [];
  return val.split(/\s*\|\s*/).map(s => s.trim()).filter(Boolean);
}

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return { first: parts[0] || '—', last: '—' };
  const prefixes = ['van', 'de', 'den', 'der', 'het', 'ten', 'ter', 'op', "'t", 'in'];
  let splitIdx = 1;
  for (let i = 1; i < parts.length; i++) {
    if (prefixes.includes(parts[i].toLowerCase())) { splitIdx = i; break; }
    if (i === 1) splitIdx = 1;
  }
  return {
    first: parts.slice(0, splitIdx).join(' ') || '—',
    last: parts.slice(splitIdx).join(' ') || '—',
  };
}

function cleanPhone(phone: string | undefined): string | null {
  if (!phone) return null;
  return phone.trim() || null;
}

function parseCrmGroup(raw: string): string | null {
  if (!raw || !raw.startsWith('a:')) return null;
  const labels: Record<string, string> = {
    huurder_kantoorruimte: 'Huurder kantoorruimte',
    huurder_hybride_enof_virtueel_kantoor: 'Huurder hybride/virtueel kantoor',
    kookstudio: 'Kookstudio',
    vergaderaccommodatie: 'Vergaderaccommodatie',
    horeca: 'Horeca',
    overige: 'Overige',
    oud_huurder: 'Oud-huurder',
  };
  const active: string[] = [];
  for (const [key, label] of Object.entries(labels)) {
    // Match "key";"<key>" followed by "value";"1" (or value";i:1)
    const pattern = new RegExp(`"${key}".*?"value";(?:s:1:"|i:)1`, 's');
    if (pattern.test(raw)) active.push(label);
  }
  return active.length > 0 ? active.join(', ') : null;
}

/* ── Component ──────────────────────────────────────────── */

export default function MasterImport() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [companyFile, setCompanyFile] = useState<File | null>(null);
  const [contactFile, setContactFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [syncingGHL, setSyncingGHL] = useState(false);
  const companyFileRef = useRef<HTMLInputElement>(null);
  const contactFileRef = useRef<HTMLInputElement>(null);

  const parseXlsx = async (file: File): Promise<Record<string, any>[]> => {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: '' });
  };

  const handleImport = async () => {
    if (!user || (!companyFile && !contactFile)) return;
    setImporting(true);
    setProgress(0);
    setResult(null);

    try {
      // ═══ PHASE 1: Parse both files ═══
      setStatus('Bestanden inlezen...');
      
      let companyRows: Record<string, any>[] = [];
      let contactRows: Record<string, any>[] = [];
      
      if (companyFile) {
        companyRows = await parseXlsx(companyFile);
        console.log(`[Import] Bedrijvenbestand: ${companyRows.length} rijen, kolommen:`, Object.keys(companyRows[0] || {}));
      }
      if (contactFile) {
        contactRows = await parseXlsx(contactFile);
        console.log(`[Import] Contactenbestand: ${contactRows.length} rijen, kolommen:`, Object.keys(contactRows[0] || {}));
      }
      setProgress(10);

      // ═══ PHASE 2: Parse company data ═══
      interface ParsedCompany {
        name: string;
        oldId: string;
        customerNumber: string | null;
        kvk: string | null;
        btw: string | null;
        address: string | null;
        postcode: string | null;
        city: string | null;
        country: string | null;
        phone: string | null;
        email: string | null;
        website: string | null;
        crmGroup: string | null;
      }
      
      const companies: ParsedCompany[] = [];
      const companyNames = new Set<string>();

      for (const row of companyRows) {
        const name = findCol(row, 'Bedrijfsnaam', 'bedrijfsnaam', 'naam', 'name', 'company');
        const oldId = findCol(row, 'customer_id', 'id');
        if (!name) continue;

        const nameKey = name.toLowerCase().trim();
        if (companyNames.has(nameKey)) continue;
        companyNames.add(nameKey);

        const crmGroupRaw = findCol(row, 'CRM Groep | Doelgroep', 'CRM Groep', 'crm_groep', 'doelgroep');

        companies.push({
          name,
          oldId,
          customerNumber: findCol(row, 'Klantnummer', 'klantnummer', 'customer_number') || null,
          kvk: findCol(row, 'KVK', 'kvk') || null,
          btw: findCol(row, 'BTW nummer', 'btw_nummer', 'btw', 'btw nummer') || null,
          address: findCol(row, 'Straat + huisnummer', 'straat', 'adres', 'address') || null,
          postcode: findCol(row, 'Postcode', 'postcode') || null,
          city: findCol(row, 'Plaats', 'plaats', 'city', 'woonplaats') || null,
          country: findCol(row, 'Land', 'land', 'country') || null,
          phone: cleanPhone(findCol(row, 'Telefoon Bedrijf', 'telefoon', 'phone', 'tel')),
          email: findCol(row, 'E-mail Bedrijf', 'email bedrijf', 'e-mail', 'email') ? findCol(row, 'E-mail Bedrijf', 'email bedrijf', 'e-mail', 'email').replace(/\\@/g, '@') : null,
          website: findCol(row, 'Website', 'website', 'url') || null,
          crmGroup: parseCrmGroup(crmGroupRaw),
        });
      }

      // ═══ PHASE 3: Parse contacts from the contact file ═══
      interface ParsedContact {
        firstName: string;
        lastName: string;
        email: string | null;
        phone: string | null;
        mobile: string | null;
        function_title: string | null;
        department: string | null;
        companyOldId: string | null;
        customerName: string;
      }

      const contacts: ParsedContact[] = [];

      // Also extract companies from the contact file if no company file
      const extraCompanyNames = new Set<string>(companyNames);

      for (const row of contactRows) {
        const type = findCol(row, 'klant_type', 'type', 'klanttype');
        const name = findCol(row, 'klant_of_bedrijf', 'klant', 'bedrijf', 'naam', 'name', 'klant of bedrijf');
        const oldId = findCol(row, 'customer_id', 'id', 'klant_id');

        if (!name || name === 'Naam niet bepaald' || name === '0') continue;

        const contactPersons = splitPipe(findCol(row, 'contactpersonen', 'contactpersoon', 'contact'));
        const emails = splitPipe(findCol(row, 'emails', 'email', 'e-mail'));
        const phones = splitPipe(findCol(row, 'telefoon', 'phone', 'tel'));
        const mobiles = splitPipe(findCol(row, 'mobiel', 'mobile', 'gsm'));
        const functions = splitPipe(findCol(row, 'functies', 'functie'));
        const departments = splitPipe(findCol(row, 'afdelingen', 'afdeling'));

        const isBedrijf = type.toLowerCase() === 'bedrijf';

        if (isBedrijf) {
          // If this company isn't in the company file, add it
          const nameKey = name.toLowerCase().trim();
          if (!extraCompanyNames.has(nameKey)) {
            companies.push({
              name, oldId,
              customerNumber: null, kvk: null, btw: null, address: null,
              postcode: null, city: null, country: null, phone: null,
              email: null, website: null, crmGroup: null,
            });
            extraCompanyNames.add(nameKey);
          }

          for (let i = 0; i < contactPersons.length; i++) {
            const cpName = contactPersons[i];
            if (!cpName || cpName === '...') continue;
            const { first, last } = splitName(cpName);
            contacts.push({
              firstName: first, lastName: last,
              email: emails[i] ? emails[i].replace(/\\@/g, '@') : null,
              phone: cleanPhone(phones[i]), mobile: cleanPhone(mobiles[i]),
              function_title: functions[i] || null, department: departments[i] || null,
              companyOldId: oldId, customerName: name,
            });
          }
        } else {
          // Persoon
          if (contactPersons.length > 0) {
            for (let i = 0; i < contactPersons.length; i++) {
              const cpName = contactPersons[i];
              if (!cpName || cpName === '...') continue;
              const { first, last } = splitName(cpName);
              contacts.push({
                firstName: first, lastName: last,
                email: emails[i] ? emails[i].replace(/\\@/g, '@') : (i === 0 && emails[0] ? emails[0].replace(/\\@/g, '@') : null),
                phone: cleanPhone(phones[i]) || (i === 0 ? cleanPhone(phones[0]) : null),
                mobile: cleanPhone(mobiles[i]) || (i === 0 ? cleanPhone(mobiles[0]) : null),
                function_title: functions[i] || null, department: departments[i] || null,
                companyOldId: null, customerName: name,
              });
            }
          } else {
            const { first, last } = splitName(name);
            contacts.push({
              firstName: first, lastName: last,
              email: emails[0] ? emails[0].replace(/\\@/g, '@') : null,
              phone: cleanPhone(phones[0]), mobile: cleanPhone(mobiles[0]),
              function_title: null, department: null, companyOldId: null, customerName: name,
            });
          }
        }
      }

      setProgress(20);
      console.log(`[Import] Totaal: ${companies.length} bedrijven, ${contacts.length} contacten`);
      setStatus(`Gevonden: ${companies.length} bedrijven, ${contacts.length} contactpersonen`);

      if (companies.length === 0 && contacts.length === 0) {
        toast({
          title: 'Import gestopt',
          description: 'Geen data gevonden in de bestanden. Controleer de kolomnamen.',
          variant: 'destructive',
        });
        setImporting(false);
        return;
      }

      // ═══ PHASE 4: Clear existing data ═══
      setStatus('Bestaande contacten en bedrijven verwijderen...');
      await supabase.from('contact_companies').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('contacts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('companies').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      setProgress(30);

      // ═══ PHASE 5: Insert companies ═══
      setStatus(`${companies.length} bedrijven invoegen...`);
      const companyNameToId: Record<string, string> = {};
      const oldIdToCompanyId: Record<string, string> = {};
      let companiesCreated = 0;

      // Insert one by one to handle duplicates gracefully and track IDs
      for (let i = 0; i < companies.length; i++) {
        const c = companies[i];
        const { data: inserted, error } = await (supabase as any)
          .from('companies')
          .upsert({
            user_id: user.id,
            name: c.name,
            customer_number: c.customerNumber,
            kvk: c.kvk,
            btw_number: c.btw,
            address: c.address,
            postcode: c.postcode,
            city: c.city,
            country: c.country || 'NL',
            phone: c.phone,
            email: c.email,
            website: c.website,
            crm_group: c.crmGroup,
          }, { onConflict: 'user_id,name', ignoreDuplicates: false })
          .select('id, name')
          .single();

        if (error) {
          // If upsert fails, try to find existing
          const { data: existing } = await (supabase as any)
            .from('companies')
            .select('id, name')
            .eq('name', c.name)
            .limit(1)
            .single();
          if (existing) {
            companyNameToId[existing.name.toLowerCase().trim()] = existing.id;
            if (c.oldId) oldIdToCompanyId[c.oldId] = existing.id;
          } else {
            console.error('Company error:', c.name, error.message);
          }
        } else if (inserted) {
          companyNameToId[inserted.name.toLowerCase().trim()] = inserted.id;
          if (c.oldId) oldIdToCompanyId[c.oldId] = inserted.id;
          companiesCreated++;
        }

        if (i % 50 === 0) {
          setProgress(30 + Math.round((i / companies.length) * 25));
          setStatus(`Bedrijven: ${i}/${companies.length}...`);
          // Small delay every 50 to avoid rate limiting
          await new Promise(r => setTimeout(r, 200));
        }
      }

      setProgress(55);

      // ═══ PHASE 6: Insert contacts ═══
      setStatus(`${contacts.length} contactpersonen invoegen...`);
      let contactsCreated = 0;
      let linked = 0;
      const errors: string[] = [];
      const seenContacts = new Set<string>();

      for (let i = 0; i < contacts.length; i += 50) {
        const batch = contacts.slice(i, i + 50);
        const insertBatch: any[] = [];

        for (const c of batch) {
          const dedupKey = `${c.firstName.toLowerCase().trim()}|${c.lastName.toLowerCase().trim()}|${(c.customerName || '').toLowerCase().trim()}`;
          if (seenContacts.has(dedupKey)) continue;
          seenContacts.add(dedupKey);

          // Resolve company: try oldId first, then name match
          let companyId = c.companyOldId ? oldIdToCompanyId[c.companyOldId] : null;
          if (!companyId && c.customerName) {
            companyId = companyNameToId[c.customerName.toLowerCase().trim()] || null;
          }
          const companyName = companyId ? c.customerName : (c.companyOldId ? c.customerName : null);

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
      const results: string[] = [];
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

      await new Promise(r => setTimeout(r, 1500));
      try {
        const { data } = await supabase.functions.invoke('ghl-sync', { body: { action: 'sync-companies' } });
        results.push(`${data?.synced || 0} bedrijven`);
      } catch {}

      toast({ title: '✅ GHL Sync voltooid', description: `Gematcht: ${results.join(', ')}` });
    } catch (err: any) {
      toast({ title: 'Sync mislukt', description: err.message, variant: 'destructive' });
    } finally {
      setSyncingGHL(false);
    }
  };

  const hasFiles = companyFile || contactFile;

  return (
    <div className="rounded-xl border bg-card p-6 card-shadow space-y-5">
      <div>
        <h3 className="font-semibold text-card-foreground">Master CRM Import</h3>
        <p className="text-xs text-muted-foreground">
          Importeer bedrijven en contactpersonen uit twee Excel-bestanden. Bestaande contacten en bedrijven worden eerst verwijderd.
        </p>
      </div>

      {/* Company file upload */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Building2 size={13} /> Bestand 1: Bedrijvenlijst (KVK, adres, website, etc.)
        </label>
        <div className="rounded-lg border-2 border-dashed p-3 cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => companyFileRef.current?.click()}
        >
          <input ref={companyFileRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) setCompanyFile(e.target.files[0]); }}
          />
          {companyFile ? (
            <div className="flex items-center gap-2 text-sm text-foreground">
              <CheckCircle2 size={14} className="text-success" />
              <span className="font-medium text-xs">{companyFile.name}</span>
              <span className="text-muted-foreground text-xs">({(companyFile.size / 1024).toFixed(0)} KB)</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Upload size={14} />
              <span>Klantenoverzicht_CRM (.xlsx)</span>
            </div>
          )}
        </div>
      </div>

      {/* Contact file upload */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Users size={13} /> Bestand 2: Contactpersonen (met bedrijfskoppeling)
        </label>
        <div className="rounded-lg border-2 border-dashed p-3 cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => contactFileRef.current?.click()}
        >
          <input ref={contactFileRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) setContactFile(e.target.files[0]); }}
          />
          {contactFile ? (
            <div className="flex items-center gap-2 text-sm text-foreground">
              <CheckCircle2 size={14} className="text-success" />
              <span className="font-medium text-xs">{contactFile.name}</span>
              <span className="text-muted-foreground text-xs">({(contactFile.size / 1024).toFixed(0)} KB)</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Upload size={14} />
              <span>CRM_master_overzicht (.xlsx)</span>
            </div>
          )}
        </div>
      </div>

      {!importing && !result && hasFiles && (
        <div className="rounded-lg border border-warning/50 bg-warning/10 p-3 flex items-start gap-2">
          <AlertTriangle size={16} className="text-warning mt-0.5 shrink-0" />
          <div className="text-xs text-warning">
            <p className="font-semibold">Let op!</p>
            <p>Alle bestaande contacten en bedrijven worden verwijderd en vervangen. Aanvragen, reserveringen en taken blijven behouden.</p>
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
          <p className="text-muted-foreground">Bedrijven: <strong>{result.companiesCreated}</strong></p>
          <p className="text-muted-foreground">Contacten: <strong>{result.contactsCreated}</strong></p>
          <p className="text-muted-foreground">Gekoppeld aan bedrijf: <strong>{result.linked}</strong></p>
          {result.errors.length > 0 && (
            <div className="text-xs text-destructive mt-1">
              {result.errors.length} fout(en) — bekijk de console
            </div>
          )}
          <div className="pt-3 border-t mt-3">
            <p className="text-xs text-muted-foreground mb-2">
              Stap 2: Synchroniseer met VirtuGrow om GHL-koppelingen te leggen.
            </p>
            <Button variant="outline" size="sm" disabled={syncingGHL} onClick={handleGHLSync}>
              {syncingGHL ? (
                <><Loader2 size={14} className="mr-1.5 animate-spin" /> Synchroniseren...</>
              ) : (
                <><RefreshCw size={14} className="mr-1.5" /> GHL Koppeling Uitvoeren</>
              )}
            </Button>
          </div>
        </div>
      )}

      <Button onClick={handleImport} disabled={importing || !hasFiles}>
        {importing ? (
          <><Loader2 size={14} className="mr-1.5 animate-spin" /> Importeren...</>
        ) : (
          <><Upload size={14} className="mr-1.5" /> Master Import Starten</>
        )}
      </Button>
    </div>
  );
}
