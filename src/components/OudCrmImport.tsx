import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Search, Upload, CheckCircle2, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';

const FILES = [
  { key: 'bedrijven', path: '/import/Bedrijven.xlsx', label: 'Bedrijven' },
  { key: 'contactpersonen', path: '/import/Contactpersonen.xlsx', label: 'Contactpersonen' },
  { key: 'particulieren', path: '/import/Particulieren.xlsx', label: 'Particulieren' },
  { key: 'aanvragen', path: '/import/Aanvragen.xlsx', label: 'Aanvragen' },
  { key: 'reserveringen', path: '/import/Reserveringen.xlsx', label: 'Reserveringen' },
  { key: 'taken', path: '/import/Taken.xlsx', label: 'Taken' },
  { key: 'gesprekken', path: '/import/Gesprekshistorie.xlsx', label: 'Gesprekshistorie' },
];

interface FileAnalysis {
  key: string;
  label: string;
  columns: string[];
  rowCount: number;
  firstRow: Record<string, any>;
  rows: Record<string, any>[];
  error?: string;
}

/* ── Helpers ──────────────────────────────────────── */

function findCol(row: Record<string, any>, ...candidates: string[]): string {
  for (const c of candidates) {
    if (row[c] !== undefined && row[c] !== null && row[c] !== '') return String(row[c]).trim();
  }
  const lowerCandidates = candidates.map(c => c.toLowerCase().replace(/[_\s]+/g, ' ').trim());
  for (const key of Object.keys(row)) {
    const lk = key.toLowerCase().replace(/[_\s]+/g, ' ').trim();
    for (const lc of lowerCandidates) {
      if (lk === lc || lk.includes(lc) || lc.includes(lk)) {
        const val = row[key];
        if (val !== undefined && val !== null && val !== '') return String(val).trim();
      }
    }
  }
  return '';
}

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return { first: parts[0] || '—', last: '—' };
  const prefixes = ['van', 'de', 'den', 'der', 'het', 'ten', 'ter', 'op', "'t", 'in'];
  let splitIdx = 1;
  for (let i = 1; i < parts.length; i++) {
    if (prefixes.includes(parts[i].toLowerCase())) { splitIdx = i; break; }
  }
  return {
    first: parts.slice(0, splitIdx).join(' ') || '—',
    last: parts.slice(splitIdx).join(' ') || '—',
  };
}

function cleanEmail(val: string | undefined): string | null {
  if (!val) return null;
  return val.trim().replace(/\\@/g, '@') || null;
}

function excelDateToString(val: any): string | null {
  if (!val) return null;
  if (typeof val === 'number') {
    // Excel serial date
    const d = new Date((val - 25569) * 86400 * 1000);
    return d.toISOString().slice(0, 10);
  }
  return String(val).trim() || null;
}

function excelDateToISO(val: any): string | null {
  if (!val) return null;
  if (typeof val === 'number') {
    const d = new Date((val - 25569) * 86400 * 1000);
    return d.toISOString();
  }
  // Try parsing as date string
  const d = new Date(String(val));
  if (!isNaN(d.getTime())) return d.toISOString();
  return null;
}

/* ── Component ──────────────────────────────────── */

export default function OudCrmImport() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [analyses, setAnalyses] = useState<FileAnalysis[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState<Record<string, number> | null>(null);
  const [syncingGHL, setSyncingGHL] = useState(false);

  const parseXlsx = async (path: string): Promise<Record<string, any>[]> => {
    const resp = await fetch(path);
    const buffer = await resp.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: '' });
  };

  /* ═══ ANALYSE ═══ */
  const handleAnalyze = async () => {
    setAnalyzing(true);
    setAnalyses([]);
    const results: FileAnalysis[] = [];

    for (const f of FILES) {
      try {
        const rows = await parseXlsx(f.path);
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
        results.push({
          key: f.key, label: f.label, columns, rowCount: rows.length,
          firstRow: rows[0] || {}, rows,
        });
        console.log(`[Analyse] ${f.label}: ${rows.length} rijen, kolommen:`, columns);
        if (rows[0]) console.log(`[Analyse] ${f.label} eerste rij:`, rows[0]);
      } catch (err: any) {
        results.push({
          key: f.key, label: f.label, columns: [], rowCount: 0,
          firstRow: {}, rows: [], error: err.message,
        });
      }
    }

    setAnalyses(results);
    setAnalyzing(false);
  };

  /* ── Batch helper: insert in chunks with retry ── */
  const batchInsert = async (table: string, records: any[], batchSize = 50, delayMs = 500) => {
    let inserted = 0;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const { error, data } = await (supabase as any).from(table).insert(batch).select('id');
      if (error) {
        // Fallback: insert one by one
        for (const item of batch) {
          const { error: e2 } = await (supabase as any).from(table).insert(item);
          if (!e2) inserted++;
          else if (e2.code !== '23505') console.error(`${table} error:`, e2.message);
        }
      } else {
        inserted += data?.length || batch.length;
      }
      if (i + batchSize < records.length) await new Promise(r => setTimeout(r, delayMs));
    }
    return inserted;
  };

  /* ═══ IMPORT ═══ */
  const handleImport = async () => {
    if (!user) return;
    if (analyses.length === 0) {
      toast({ title: 'Analyseer eerst de bestanden', variant: 'destructive' });
      return;
    }

    setImporting(true);
    setProgress(0);
    setResult(null);
    const counts: Record<string, number> = {};

    try {
      const getFile = (key: string) => analyses.find(a => a.key === key);

      // ═══ STEP 1: Clear existing data ═══
      setStatus('Bestaande data verwijderen...');
      await supabase.from('contact_companies').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('contacts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('companies').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      setProgress(5);

      // ═══ STEP 2: Import Bedrijven (batch) ═══
      setStatus('Bedrijven importeren...');
      const bedrijvenFile = getFile('bedrijven');
      const companyNameToId: Record<string, string> = {};
      counts.bedrijven = 0;

      if (bedrijvenFile && bedrijvenFile.rows.length > 0) {
        const seen = new Set<string>();
        const companyRecords: any[] = [];

        for (const row of bedrijvenFile.rows) {
          const name = findCol(row, 'Bedrijfsnaam', 'bedrijf', 'naam', 'name', 'company');
          if (!name || name === '0') continue;
          const nameKey = name.toLowerCase().trim();
          if (seen.has(nameKey)) continue;
          seen.add(nameKey);

          companyRecords.push({
            user_id: user.id,
            name,
            customer_number: findCol(row, 'Klantnummer', 'klantnummer', 'customer_number') || null,
            kvk: findCol(row, 'KVK', 'kvk') || null,
            btw_number: findCol(row, 'BTW nummer', 'btw_nummer', 'btw', 'BTW') || null,
            address: findCol(row, 'Straat + huisnummer', 'straat', 'adres', 'address', 'Straat') || null,
            postcode: findCol(row, 'Postcode', 'postcode') || null,
            city: findCol(row, 'Plaats', 'plaats', 'city', 'woonplaats') || null,
            country: findCol(row, 'Land', 'land', 'country') || 'NL',
            phone: findCol(row, 'Telefoon Bedrijf', 'telefoon', 'phone', 'tel', 'Telefoon') || null,
            email: cleanEmail(findCol(row, 'E-mail Bedrijf', 'email bedrijf', 'e-mail', 'email', 'Email')) || null,
            website: findCol(row, 'Website', 'website', 'url') || null,
            crm_group: findCol(row, 'CRM Groep', 'crm groep', 'doelgroep', 'groep') || null,
            notes: findCol(row, 'Notities', 'notities', 'notes', 'opmerkingen') || null,
          });
        }

        setStatus(`${companyRecords.length} bedrijven invoegen...`);
        counts.bedrijven = await batchInsert('companies', companyRecords);
        console.log(`[Import] ${counts.bedrijven} bedrijven geïmporteerd`);

        // Fetch all company IDs for linking
        const { data: allCompanies } = await supabase
          .from('companies').select('id, name').eq('user_id', user.id).limit(2000);
        for (const c of allCompanies || []) {
          companyNameToId[c.name.toLowerCase().trim()] = c.id;
        }
      }
      setProgress(20);

      // ═══ STEP 3: Import Contactpersonen (batch) ═══
      setStatus('Contactpersonen importeren...');
      const contactFile = getFile('contactpersonen');
      const contactNameToId: Record<string, string> = {};
      counts.contactpersonen = 0;

      if (contactFile && contactFile.rows.length > 0) {
        const contactRecords: any[] = [];
        const seen = new Set<string>();

        for (const row of contactFile.rows) {
          let firstName = findCol(row, 'Voornaam', 'voornaam', 'first_name', 'firstname');
          let lastName = findCol(row, 'Achternaam', 'achternaam', 'last_name', 'lastname');
          const fullName = findCol(row, 'Naam', 'naam', 'name', 'contactpersoon');

          if (!firstName && !lastName && fullName) {
            const split = splitName(fullName);
            firstName = split.first;
            lastName = split.last;
          }
          if (!firstName && !lastName) continue;
          firstName = firstName || '—';
          lastName = lastName || '—';

          const dedupKey = `${firstName.toLowerCase()}|${lastName.toLowerCase()}`;
          if (seen.has(dedupKey)) continue;
          seen.add(dedupKey);

          const companyName = findCol(row, 'Bedrijf', 'bedrijf', 'company', 'organisatie', 'bedrijfsnaam');
          const companyId = companyName ? companyNameToId[companyName.toLowerCase().trim()] || null : null;

          contactRecords.push({
            user_id: user.id,
            first_name: firstName,
            last_name: lastName,
            email: cleanEmail(findCol(row, 'Email', 'email', 'e-mail', 'emailadres')) || null,
            phone: findCol(row, 'Telefoon', 'telefoon', 'phone', 'tel', 'telefoonnummer', 'Mobiel', 'mobiel') || null,
            company: companyName || null,
            company_id: companyId,
            status: 'lead',
            notes: findCol(row, 'Notities', 'notities', 'notes', 'opmerkingen', 'Functie', 'functie') || null,
          });
        }

        setStatus(`${contactRecords.length} contactpersonen invoegen...`);
        counts.contactpersonen = await batchInsert('contacts', contactRecords);
      }
      setProgress(35);

      // ═══ STEP 4: Import Particulieren (batch) ═══
      setStatus('Particulieren importeren...');
      const partFile = getFile('particulieren');
      counts.particulieren = 0;

      if (partFile && partFile.rows.length > 0) {
        const partRecords: any[] = [];
        // Re-fetch existing contact names to avoid duplicates
        const { data: existingContacts } = await supabase
          .from('contacts').select('first_name, last_name').eq('user_id', user.id).limit(5000);
        const existingNames = new Set((existingContacts || []).map(
          c => `${c.first_name?.toLowerCase()}|${c.last_name?.toLowerCase()}`
        ));

        for (const row of partFile.rows) {
          let firstName = findCol(row, 'Voornaam', 'voornaam', 'first_name');
          let lastName = findCol(row, 'Achternaam', 'achternaam', 'last_name');
          const fullName = findCol(row, 'Naam', 'naam', 'name', 'klant');

          if (!firstName && !lastName && fullName) {
            const split = splitName(fullName);
            firstName = split.first;
            lastName = split.last;
          }
          if (!firstName && !lastName) continue;
          firstName = firstName || '—';
          lastName = lastName || '—';

          const dedupKey = `${firstName.toLowerCase()}|${lastName.toLowerCase()}`;
          if (existingNames.has(dedupKey)) continue;
          existingNames.add(dedupKey);

          partRecords.push({
            user_id: user.id,
            first_name: firstName,
            last_name: lastName,
            email: cleanEmail(findCol(row, 'Email', 'email', 'e-mail')) || null,
            phone: findCol(row, 'Telefoon', 'telefoon', 'phone', 'tel', 'Mobiel', 'mobiel') || null,
            company: null,
            company_id: null,
            status: 'lead',
            notes: findCol(row, 'Notities', 'notities', 'notes') || null,
          });
        }

        setStatus(`${partRecords.length} particulieren invoegen...`);
        counts.particulieren = await batchInsert('contacts', partRecords);
      }
      setProgress(45);

      // Build a name-to-contact-id lookup from DB for linking
      const { data: allContacts } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email, company')
        .eq('user_id', user.id).limit(5000);
      
      const contactLookup: Record<string, string> = {};
      for (const c of allContacts || []) {
        const key = `${c.first_name?.toLowerCase()} ${c.last_name?.toLowerCase()}`.trim();
        contactLookup[key] = c.id;
        if (c.email) contactLookup[c.email.toLowerCase()] = c.id;
      }

      // ═══ STEP 5: Import Aanvragen (batch) ═══
      setStatus('Aanvragen importeren...');
      const aanvragenFile = getFile('aanvragen');
      counts.aanvragen = 0;

      if (aanvragenFile && aanvragenFile.rows.length > 0) {
        const records: any[] = [];
        for (const row of aanvragenFile.rows) {
          const contactName = findCol(row, 'Contactpersoon', 'contactpersoon', 'naam', 'klant', 'contact', 'Naam');
          const eventType = findCol(row, 'Type evenement', 'evenement', 'event_type', 'type', 'soort');
          if (!contactName && !eventType) continue;

          const contactId = contactLookup[contactName?.toLowerCase()?.trim() || ''] || null;
          records.push({
            user_id: user.id,
            contact_name: contactName || 'Onbekend',
            contact_id: contactId,
            event_type: eventType || 'Overig',
            guest_count: parseInt(findCol(row, 'Aantal gasten', 'gasten', 'guest_count', 'aantal')) || 0,
            preferred_date: excelDateToString(findCol(row, 'Voorkeursdatum', 'datum', 'preferred_date', 'date') || null),
            room_preference: findCol(row, 'Zaal', 'zaal', 'ruimte', 'room', 'room_preference') || null,
            message: findCol(row, 'Bericht', 'bericht', 'message', 'opmerking', 'notities') || null,
            status: findCol(row, 'Status', 'status') || 'new',
            source: findCol(row, 'Bron', 'bron', 'source') || 'Oud CRM',
            budget: parseFloat(findCol(row, 'Budget', 'budget')) || null,
            is_read: true,
          });
        }
        setStatus(`${records.length} aanvragen invoegen...`);
        counts.aanvragen = await batchInsert('inquiries', records);
      }
      setProgress(55);

      // ═══ STEP 6: Import Reserveringen (batch) ═══
      setStatus('Reserveringen importeren...');
      const resFile = getFile('reserveringen');
      counts.reserveringen = 0;

      if (resFile && resFile.rows.length > 0) {
        const records: any[] = [];
        for (const row of resFile.rows) {
          const title = findCol(row, 'Titel', 'titel', 'title', 'naam', 'evenement');
          const contactName = findCol(row, 'Contactpersoon', 'contactpersoon', 'klant', 'naam', 'contact');
          const dateVal = findCol(row, 'Datum', 'datum', 'date');
          const roomName = findCol(row, 'Zaal', 'zaal', 'ruimte', 'room', 'locatie');
          if (!title && !contactName && !dateVal) continue;

          const contactId = contactLookup[contactName?.toLowerCase()?.trim() || ''] || null;
          const dateStr = excelDateToString(dateVal) || new Date().toISOString().slice(0, 10);

          records.push({
            user_id: user.id,
            title: title || contactName || 'Reservering',
            contact_name: contactName || 'Onbekend',
            contact_id: contactId,
            date: dateStr,
            room_name: roomName || 'Onbekend',
            start_hour: parseInt(findCol(row, 'Start uur', 'start', 'begintijd', 'start_hour')) || 9,
            end_hour: parseInt(findCol(row, 'Eind uur', 'eind', 'eindtijd', 'end_hour')) || 17,
            start_minute: 0,
            end_minute: 0,
            guest_count: parseInt(findCol(row, 'Aantal gasten', 'gasten', 'guest_count', 'aantal')) || 0,
            status: findCol(row, 'Status', 'status') || 'confirmed',
            notes: findCol(row, 'Notities', 'notities', 'notes', 'opmerkingen') || null,
          });
        }
        setStatus(`${records.length} reserveringen invoegen...`);
        counts.reserveringen = await batchInsert('bookings', records);
      }
      setProgress(65);

      // ═══ STEP 7: Import Taken (batch) ═══
      setStatus('Taken importeren...');
      const takenFile = getFile('taken');
      counts.taken = 0;

      if (takenFile && takenFile.rows.length > 0) {
        const records: any[] = [];
        for (const row of takenFile.rows) {
          const title = findCol(row, 'Titel', 'titel', 'title', 'taak', 'naam');
          if (!title) continue;

          const contactName = findCol(row, 'Contact', 'contact', 'contactpersoon', 'naam');
          const contactId = contactLookup[contactName?.toLowerCase()?.trim() || ''] || null;
          const statusVal = (findCol(row, 'Status', 'status') || 'open').toLowerCase().trim();
          const isCompleted = ['voltooid', 'completed', 'done', 'afgerond'].includes(statusVal);
          const isInProgress = ['in_progress', 'bezig', 'lopend', 'in behandeling'].includes(statusVal);
          const mappedStatus = isCompleted ? 'completed' : isInProgress ? 'in_progress' : 'open';

          const priorityVal = (findCol(row, 'Prioriteit', 'prioriteit', 'priority') || 'normal').toLowerCase().trim();
          const mappedPriority = ['low', 'normal', 'high', 'urgent'].includes(priorityVal) ? priorityVal : 'normal';

          records.push({
            user_id: user.id,
            title,
            description: findCol(row, 'Beschrijving', 'beschrijving', 'description', 'omschrijving') || null,
            contact_id: contactId,
            status: mappedStatus,
            priority: mappedPriority,
            due_date: excelDateToString(findCol(row, 'Deadline', 'deadline', 'due_date', 'vervaldatum')),
            assigned_to: findCol(row, 'Toegewezen aan', 'toegewezen', 'assigned_to') || null,
            completed_at: isCompleted ? new Date().toISOString() : null,
          });
        }
        setStatus(`${records.length} taken invoegen...`);
        counts.taken = await batchInsert('tasks', records);
      }
      setProgress(75);

      // ═══ STEP 8: Import Gesprekshistorie ═══
      setStatus('Gesprekshistorie importeren...');
      const gesprekkenFile = getFile('gesprekken');
      counts.gesprekken = 0;

      if (gesprekkenFile && gesprekkenFile.rows.length > 0) {
        for (let i = 0; i < gesprekkenFile.rows.length; i++) {
          const row = gesprekkenFile.rows[i];
          const contactName = findCol(row, 'Contact', 'contact', 'contactpersoon', 'naam', 'klant');
          const body = findCol(row, 'Bericht', 'bericht', 'message', 'body', 'inhoud', 'tekst');

          if (!contactName && !body) continue;

          const contactId = contactLookup[contactName?.toLowerCase()?.trim() || ''] || null;

          // Store as contact activity (note)
          if (contactId) {
            const record: any = {
              user_id: user.id,
              contact_id: contactId,
              type: findCol(row, 'Type', 'type', 'kanaal') || 'note',
              subject: findCol(row, 'Onderwerp', 'onderwerp', 'subject') || null,
              body: body || findCol(row, 'Notitie', 'notitie', 'note') || null,
            };

            const dateVal = findCol(row, 'Datum', 'datum', 'date', 'created_at');
            if (dateVal) {
              const isoDate = excelDateToISO(dateVal);
              if (isoDate) record.created_at = isoDate;
            }

            const { error } = await supabase.from('contact_activities').insert(record);
            if (!error) counts.gesprekken!++;
          }

          if (i % 50 === 0) {
            setProgress(75 + Math.round((i / gesprekkenFile.rows.length) * 10));
            await new Promise(r => setTimeout(r, 100));
          }
        }
      }
      setProgress(100);
      setStatus('Import voltooid!');
      setResult(counts);

      toast({
        title: '✅ Oud CRM Import voltooid',
        description: Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', '),
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

      // Push contacts CRM → GHL
      const { data: pushData } = await supabase.functions.invoke('ghl-sync', {
        body: { action: 'push-contacts' },
      });
      results.push(`${pushData?.pushed || 0} contacten gepusht`);

      await new Promise(r => setTimeout(r, 1500));

      // Sync companies
      const { data: compData } = await supabase.functions.invoke('ghl-sync', {
        body: { action: 'sync-companies' },
      });
      results.push(`${compData?.synced || 0} bedrijven`);

      toast({ title: '✅ GHL Sync voltooid', description: results.join(', ') });
    } catch (err: any) {
      toast({ title: 'Sync mislukt', description: err.message, variant: 'destructive' });
    } finally {
      setSyncingGHL(false);
    }
  };

  return (
    <div className="rounded-xl border bg-card p-6 card-shadow space-y-5">
      <div>
        <h3 className="font-semibold text-card-foreground">Oud CRM Import</h3>
        <p className="text-xs text-muted-foreground">
          Importeer alle gegevens uit het oude CRM: bedrijven, contactpersonen, particulieren, aanvragen, reserveringen, taken en gesprekshistorie.
        </p>
      </div>

      {/* Step 1: Analyze */}
      <Button variant="outline" onClick={handleAnalyze} disabled={analyzing || importing}>
        {analyzing ? (
          <><Loader2 size={14} className="mr-1.5 animate-spin" /> Analyseren...</>
        ) : (
          <><Search size={14} className="mr-1.5" /> Stap 1: Bestanden Analyseren</>
        )}
      </Button>

      {/* Analysis results */}
      {analyses.length > 0 && (
        <div className="space-y-2">
          {analyses.map(a => (
            <div key={a.key} className={`rounded-lg border p-3 text-xs ${a.error ? 'border-destructive/50 bg-destructive/5' : 'bg-muted/30'}`}>
              <div className="flex items-center justify-between">
                <span className="font-semibold">{a.label}</span>
                <span className="text-muted-foreground">
                  {a.error ? `❌ ${a.error}` : `${a.rowCount} rijen · ${a.columns.length} kolommen`}
                </span>
              </div>
              {!a.error && a.columns.length > 0 && (
                <div className="mt-1 text-muted-foreground">
                  Kolommen: {a.columns.join(', ')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Warning */}
      {analyses.length > 0 && !importing && !result && (
        <div className="rounded-lg border border-warning/50 bg-warning/10 p-3 flex items-start gap-2">
          <AlertTriangle size={16} className="text-warning mt-0.5 shrink-0" />
          <div className="text-xs text-warning">
            <p className="font-semibold">Let op!</p>
            <p>Alle bestaande contacten en bedrijven worden verwijderd en vervangen door de import. Aanvragen, reserveringen en taken worden <strong>toegevoegd</strong> (niet verwijderd).</p>
          </div>
        </div>
      )}

      {/* Progress */}
      {importing && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 size={14} className="animate-spin text-primary" />
            <span className="text-muted-foreground">{status}</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <CheckCircle2 size={16} className="text-success" /> Import resultaat
          </div>
          {Object.entries(result).map(([key, val]) => (
            <p key={key} className="text-muted-foreground capitalize">
              {key}: <strong>{val}</strong>
            </p>
          ))}
          <div className="pt-3 border-t mt-3">
            <p className="text-xs text-muted-foreground mb-2">
              Stap 3: Synchroniseer met VirtuGrow om contacten en bedrijven naar GHL te pushen.
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

      {/* Step 2: Import */}
      {analyses.length > 0 && !result && (
        <Button onClick={handleImport} disabled={importing}>
          {importing ? (
            <><Loader2 size={14} className="mr-1.5 animate-spin" /> Importeren...</>
          ) : (
            <><Upload size={14} className="mr-1.5" /> Stap 2: Volledige Import Starten</>
          )}
        </Button>
      )}
    </div>
  );
}
